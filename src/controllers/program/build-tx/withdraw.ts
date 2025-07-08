import type { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { getTokenProgram, type MarketIndex, TOKENS, makeCreateAtaIxIfNeeded, type QuartzUser, type QuartzClient, MARKET_INDEX_SOL, getTimeLockRentPayerPublicKey } from '@quartz-labs/sdk';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { HttpException } from '../../../utils/errors.js';
import { buildTransaction } from '../../../utils/helpers.js';
import { MIN_TIME_LOCK_RENT_PAYER_BALANCE } from '../../../config/constants.js';

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
        const amountBaseUnitsBN = await user.getWithdrawalLimit(marketIndex, !allowLoan);
        amountBaseUnits = amountBaseUnitsBN.toNumber();
    }

    const rentPayerBalance = await connection.getBalance(getTimeLockRentPayerPublicKey());
    const isUserPaying = rentPayerBalance < MIN_TIME_LOCK_RENT_PAYER_BALANCE;

    // Create ATA for destination if needed (wSOL is already unwrapped)
    let oix_createAta: TransactionInstruction[] = [];
    const mint = TOKENS[marketIndex].mint;
    if (mint !== TOKENS[MARKET_INDEX_SOL].mint) {
        const mintTokenProgram = await getTokenProgram(connection, mint);
        const ata = getAssociatedTokenAddressSync(mint, address, true, mintTokenProgram);
        oix_createAta = await makeCreateAtaIxIfNeeded(connection, ata, address, mint, mintTokenProgram, address);
    }

    const reduceOnly = !allowLoan;
    const {
        ixs,
        lookupTables,
        signers
    } = await user.makeInitiateWithdrawIxs(
        amountBaseUnits,
        marketIndex,
        reduceOnly,
        isUserPaying
    );

    const transaction = await buildTransaction(
        connection,
        [...oix_createAta, ...ixs],
        address,
        lookupTables
    );

    transaction.sign(signers);
    const serializedTx = Buffer.from(transaction.serialize()).toString("base64");

    return serializedTx;
}