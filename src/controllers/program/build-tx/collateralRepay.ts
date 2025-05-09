import { AddressLookupTableAccount, PublicKey, TransactionInstruction, type Connection, type Keypair, type VersionedTransaction } from '@solana/web3.js';
import { baseUnitToDecimal, type MarketIndex, QuartzClient, TOKENS, DummyWallet, type QuartzUser, getTokenProgram, makeCreateAtaIxIfNeeded, getComputeUnitPriceIx } from '@quartz-labs/sdk';
import { getConfig as getMarginfiConfig, MarginfiClient } from '@mrgnlabs/marginfi-client-v2';
import type { SwapMode, QuoteResponse } from '@jup-ag/api';
import { createCloseAccountInstruction, getAssociatedTokenAddress } from '@solana/spl-token';
import { HttpException } from '../../../utils/errors.js';
import { fetchAndParse } from '../../../utils/helpers.js';
import { JUPITER_SLIPPAGE_BPS } from '../../../config/constants.js';
import type AdvancedConnection from '@quartz-labs/connection';

export const buildCollateralRepayTransaction = async (
    address: PublicKey,
    amountSwapBaseUnits: number,
    marketIndexLoan: MarketIndex,
    marketIndexCollateral: MarketIndex,
    swapMode: SwapMode,
    connection: AdvancedConnection,
    flashLoanCaller: Keypair,
    quartzClient?: QuartzClient,
    useMaxAmount = false
): Promise<string> => {
    const client = quartzClient || await QuartzClient.fetchClient({connection});
    
    let user: QuartzUser;
    try {
        user = await client.getQuartzAccount(address);
    } catch {
        throw new HttpException(400, "User not found");
    }

    let finalAmountSwapBaseUnits = amountSwapBaseUnits;
    if (useMaxAmount) {
        finalAmountSwapBaseUnits = await user.getTokenBalance(marketIndexLoan).then(Number).then(Math.abs);
    }

    const {
        ixs,
        lookupTables,
        flashLoanAmountBaseUnits
    } = await makeCollateralRepayIxs(
        connection,
        flashLoanCaller.publicKey,
        finalAmountSwapBaseUnits,
        marketIndexLoan,
        marketIndexCollateral,
        user,
        swapMode
    );

    const transaction = await buildFlashLoanTransaction(
        connection,
        flashLoanCaller,
        flashLoanAmountBaseUnits,
        marketIndexCollateral,
        ixs,
        lookupTables
    );
    
    return Buffer.from(transaction.serialize()).toString("base64");
}

async function makeCollateralRepayIxs(
    connection: Connection,
    caller: PublicKey,
    amountSwapBaseUnits: number,
    marketIndexLoan: MarketIndex,
    marketIndexCollateral: MarketIndex,
    user: QuartzUser,
    swapMode: SwapMode
): Promise<{
    ixs: TransactionInstruction[],
    lookupTables: AddressLookupTableAccount[],
    flashLoanAmountBaseUnits: number
}> {
    const mintCollateral = TOKENS[marketIndexCollateral].mint;
    const mintLoan = TOKENS[marketIndexLoan].mint;

    const jupiterQuoteEndpoint
        = `https://lite-api.jup.ag/swap/v1/quote?inputMint=${mintCollateral.toBase58()}&outputMint=${mintLoan.toBase58()}&amount=${amountSwapBaseUnits}&slippageBps=${JUPITER_SLIPPAGE_BPS}&swapMode=${swapMode}&onlyDirectRoutes=true`;
    const jupiterQuote: QuoteResponse = await fetchAndParse(jupiterQuoteEndpoint);
    const collateralRequiredForSwap = Math.ceil(Number(jupiterQuote.inAmount) * (1 + (JUPITER_SLIPPAGE_BPS / 10_000)));

    const {
        ix: jupiterIx,
        lookupTables: jupiterLookupTables
    } = await makeJupiterIx(connection, jupiterQuote, caller);

    const { 
        ixs, 
        lookupTables: quartzLookupTables 
    } = await user.makeCollateralRepayIxs(
        caller,
        marketIndexLoan,
        marketIndexCollateral,
        jupiterIx,
        true
    );

    return {
        ixs,
        lookupTables: [...jupiterLookupTables, ...quartzLookupTables],
        flashLoanAmountBaseUnits: collateralRequiredForSwap
    };
}

async function makeJupiterIx(
    connection: Connection,
    jupiterQuote: QuoteResponse,
    address: PublicKey
): Promise<{
    ix: TransactionInstruction,
    lookupTables: AddressLookupTableAccount[]
}> {
    const instructions = await (
        await fetch('https://lite-api.jup.ag/swap/v1/swap-instructions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                quoteResponse: jupiterQuote,
                userPublicKey: address.toBase58(),
            })
        })
    ).json() as any;
    
    if (instructions.error) {
        throw new Error(`Failed to get swap instructions: ${instructions.error}`);
    }

    const {
        swapInstruction,
        addressLookupTableAddresses
    } = instructions;

    const deserializeInstruction = (instruction: any) => {
        return new TransactionInstruction({
            programId: new PublicKey(instruction.programId),
            keys: instruction.accounts.map((key: any) => ({
                pubkey: new PublicKey(key.pubkey),
                isSigner: key.isSigner,
                isWritable: key.isWritable,
            })),
            data: Buffer.from(instruction.data, "base64"),
        });
    };
    
    const getAddressLookupTableAccounts = async (
        keys: string[]
    ): Promise<AddressLookupTableAccount[]> => {
        const addressLookupTableAccountInfos =
        await connection.getMultipleAccountsInfo(
            keys.map((key) => new PublicKey(key))
        );
    
        return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
            const addressLookupTableAddress = keys[index];
            if (accountInfo && addressLookupTableAddress) {
                const addressLookupTableAccount = new AddressLookupTableAccount({
                key: new PublicKey(addressLookupTableAddress),
                state: AddressLookupTableAccount.deserialize(accountInfo.data),
                });
                acc.push(addressLookupTableAccount);
            }
        
            return acc;
        }, new Array<AddressLookupTableAccount>());
    };
    
    const addressLookupTableAccounts = await getAddressLookupTableAccounts(addressLookupTableAddresses);


    return {
        ix: deserializeInstruction(swapInstruction),
        lookupTables: addressLookupTableAccounts
    };
}

async function buildFlashLoanTransaction(
    connection: Connection,
    caller: Keypair,
    flashLoanAmountBaseUnits: number,
    flashLoanMarketIndex: MarketIndex,
    instructions: TransactionInstruction[], 
    lookupTables: AddressLookupTableAccount[] = []
): Promise<VersionedTransaction> {
    const amountLoanDecimal = baseUnitToDecimal(flashLoanAmountBaseUnits, flashLoanMarketIndex);

    // Get Marginfi account & bank
    const wallet = new DummyWallet(caller.publicKey);
    const marginfiClient = await MarginfiClient.fetch(getMarginfiConfig(), wallet, connection);
    const [ marginfiAccount ] = await marginfiClient.getMarginfiAccountsForAuthority(caller.publicKey);
    if (marginfiAccount === undefined) throw new Error("Could not find Flash Loan MarginFi account");
    if (marginfiAccount.isDisabled) throw new Error("Flash Loan MarginFi account is disabled");

    const loanBank = marginfiClient.getBankByMint(TOKENS[flashLoanMarketIndex].mint);
    if (loanBank === null) throw new Error("Could not find Flash Loan MarginFi bank");
    
    // Set compute unit price
    const ix_computePrice = await getComputeUnitPriceIx(connection, instructions);

    // Make ATA instructions (closing ATA at the end if wSol is used)
    const mintLoan = TOKENS[flashLoanMarketIndex].mint;
    const mintLoanTokenProgram = await getTokenProgram(connection, mintLoan);
    const walletAtaLoan = await getAssociatedTokenAddress(mintLoan, caller.publicKey, false, mintLoanTokenProgram);
    const oix_createAtaLoan = await makeCreateAtaIxIfNeeded(connection, walletAtaLoan, caller.publicKey, mintLoan, mintLoanTokenProgram);

    const oix_closeWSolAta: TransactionInstruction[] = [];
    if (TOKENS[flashLoanMarketIndex].name === "SOL") {
        oix_closeWSolAta.push(
            createCloseAccountInstruction(
                walletAtaLoan,
                caller.publicKey,
                caller.publicKey,
                [],
                mintLoanTokenProgram
            )
        );
    }

    // Make borrow & deposit instructions
    const { instructions: ix_borrow } = await marginfiAccount.makeBorrowIx(amountLoanDecimal, loanBank.address, {
        createAtas: false,
        wrapAndUnwrapSol: false
    });
    const { instructions: ix_deposit } = await marginfiAccount.makeDepositIx(amountLoanDecimal, loanBank.address, {
        wrapAndUnwrapSol: false
    });

    const flashloanTx = await marginfiAccount.buildFlashLoanTx({
        ixs: [
            ix_computePrice, 
            ...oix_createAtaLoan, 
            ...ix_borrow, 
            ...instructions, 
            ...ix_deposit, 
            ...oix_closeWSolAta
        ],
        addressLookupTableAccounts: lookupTables
    });

    flashloanTx.sign([caller]);

    return flashloanTx;
}