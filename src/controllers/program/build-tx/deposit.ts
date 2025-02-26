import { AddressLookupTableAccount, Connection, PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { connection, quartzClient } from '../../../index.js';
import { HttpException } from '../../../utils/errors.js';
import { buildTransaction } from '../../../utils/helpers.js';
import { createCloseAccountInstruction, createSyncNativeInstruction, getAssociatedTokenAddress } from "@solana/spl-token";
import { makeCreateAtaIxIfNeeded, getTokenProgram, TOKENS, MarketIndex, QuartzClient, QuartzUser  } from "@quartz-labs/sdk";
import { getWsolMint } from "../../../utils/helpers.js";
import { DUST_BUFFER_BASE_UNITS } from '../../../config/constants.js';


export const buildDepositTransaction = async (
    address: PublicKey,
    amountBaseUnits: number,
    marketIndex: MarketIndex,
    repayingLoan: boolean,
    useMaxAmount: boolean
) => {
    const client = quartzClient || await QuartzClient.fetchClient(connection);

    let user: QuartzUser;
    try {
        user = await client.getQuartzAccount(address);
    } catch {
        throw new HttpException(400, "User not found");
    }

    if (useMaxAmount && repayingLoan) {
        amountBaseUnits = await user.getTokenBalance(marketIndex).then(Number).then(Math.abs);
        amountBaseUnits += DUST_BUFFER_BASE_UNITS;
    }

    const {
        ixs,
        lookupTables
    } = await makeDepositIxs(connection, address, amountBaseUnits, marketIndex, user, repayingLoan);
    const transaction = await buildTransaction(connection, ixs, address, lookupTables);

    return Buffer.from(transaction.serialize()).toString("base64");
}

async function makeDepositIxs(
    connection: Connection,
    address: PublicKey,
    amountBaseUnits: number,
    marketIndex: MarketIndex,
    user: QuartzUser,
    repayingLoan: boolean
): Promise<{
    ixs: TransactionInstruction[],
    lookupTables: AddressLookupTableAccount[],
}> {
    const mint = TOKENS[marketIndex].mint;
    const mintTokenProgram = await getTokenProgram(connection, mint);
    const walletAta = await getAssociatedTokenAddress(mint, address, false, mintTokenProgram);
    const oix_createAta = await makeCreateAtaIxIfNeeded(connection, walletAta, address, mint, mintTokenProgram);

    const oix_wrapSol: TransactionInstruction[] = [];
    const oix_closeWsol: TransactionInstruction[] = [];
    if (mint === getWsolMint()) {
        const ix_wrapSol = SystemProgram.transfer({
            fromPubkey: address,
            toPubkey: walletAta,
            lamports: amountBaseUnits,
        });
        const ix_syncNative = createSyncNativeInstruction(walletAta);
        oix_wrapSol.push(ix_wrapSol, ix_syncNative);
        oix_closeWsol.push(createCloseAccountInstruction(walletAta, address, address));
    }

    const {
        ixs,
        lookupTables,
    } = await user.makeDepositIx(amountBaseUnits, marketIndex, repayingLoan);
    
    return {
        ixs: [...oix_createAta, ...oix_wrapSol, ...ixs, ...oix_closeWsol],
        lookupTables: [...lookupTables]
    };
}