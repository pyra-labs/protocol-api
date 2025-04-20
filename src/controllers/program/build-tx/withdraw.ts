import type { AddressLookupTableAccount, Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { getTokenProgram, type MarketIndex, TOKENS, makeCreateAtaIxIfNeeded, type QuartzUser, type QuartzClient } from '@quartz-labs/sdk';
import { createCloseAccountInstruction, getAssociatedTokenAddress } from '@solana/spl-token';
import { HttpException } from '../../../utils/errors.js';
import { buildTransaction, getWsolMint } from '../../../utils/helpers.js';

export const buildWithdrawTransaction = async (
    address: PublicKey,
    amountBaseUnits: number,
    marketIndex: MarketIndex,
    allowLoan: boolean,
    useMaxAmount: boolean,  
    connection: Connection,
    quartzClient: QuartzClient
): Promise<string> => {
    let user: QuartzUser;
    try {
        user = await quartzClient.getQuartzAccount(address);
    } catch {
        throw new HttpException(400, "User not found");
    }
    
    if (useMaxAmount) {
        amountBaseUnits = (await user.getWithdrawalLimit(marketIndex, !allowLoan)).toNumber();
    }

    const {
        ixs,
        lookupTables
    } = await makeWithdrawIxs(
        connection,
        address,
        amountBaseUnits,
        marketIndex,
        user,
        allowLoan
    );
    const transaction = await buildTransaction(connection, ixs, address, lookupTables);
    return Buffer.from(transaction.serialize()).toString("base64");
}

async function makeWithdrawIxs(
    connection: Connection,
    address: PublicKey,
    amountBaseUnits: number,
    marketIndex: MarketIndex,
    user: QuartzUser,
    allowLoan: boolean
): Promise<{
    ixs: TransactionInstruction[],
    lookupTables: AddressLookupTableAccount[]
}> {
    const mint = TOKENS[marketIndex].mint;
    const mintTokenProgram = await getTokenProgram(connection, mint);
    const walletAta = await getAssociatedTokenAddress(mint, address, false, mintTokenProgram);
    const oix_createAta = await makeCreateAtaIxIfNeeded(connection, walletAta, address, mint, mintTokenProgram);

    const oix_closeWsol: TransactionInstruction[] = [];
    if (mint === getWsolMint()) {
        oix_closeWsol.push(createCloseAccountInstruction(walletAta, address, address));
    }

    const reduceOnly = !allowLoan;
    const {
        ixs,
        lookupTables
    } = await user.makeInitiateWithdrawIx(amountBaseUnits, marketIndex, reduceOnly);
    return {
        ixs: [...oix_createAta, ...ixs, ...oix_closeWsol],
        lookupTables: [...lookupTables]
    };
}