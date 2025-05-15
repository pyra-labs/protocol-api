import type { Connection, PublicKey } from '@solana/web3.js';
import { BN, getTimeLockRentPayerPublicKey, type QuartzClient, type QuartzUser } from '@quartz-labs/sdk';
import { buildTransaction, getNextTimeframeReset } from '../../../utils/helpers.js';
import { HttpException } from "../../../utils/errors.js";
import { SpendLimitTimeframe } from '../../../types/enums/SpendLimitTimeframe.enum.js';
import { MIN_TIME_LOCK_RENT_PAYER_BALANCE } from '../../../config/constants.js';

export const buildAdjustSpendLimitTransaction = async (
    address: PublicKey,
    spendLimitTransactionBaseUnits: number,
    spendLimitTimeframeBaseUnits: number,
    spendLimitTimeframe: SpendLimitTimeframe,
    connection: Connection,
    quartzClient: QuartzClient
): Promise<string> => {
    const nextTimeframeResetTimestamp = getNextTimeframeReset(spendLimitTimeframe);

    let user: QuartzUser;
    try {
        user = await quartzClient.getQuartzAccount(address);
    } catch {
        throw new HttpException(400, "User not found");
    }

    const rentPayerBalance = await connection.getBalance(getTimeLockRentPayerPublicKey());
    const isUserPaying = rentPayerBalance < MIN_TIME_LOCK_RENT_PAYER_BALANCE;

    const {
        ixs,
        lookupTables,
        signers
    } = await user.makeInitiateSpendLimitsIxs(
        new BN(spendLimitTransactionBaseUnits),
        new BN(spendLimitTimeframeBaseUnits),
        new BN(spendLimitTimeframe),
        new BN(nextTimeframeResetTimestamp),
        isUserPaying
    );

    const transaction = await buildTransaction(connection, ixs, address, lookupTables);
    transaction.sign(signers);
    
    return Buffer.from(transaction.serialize()).toString("base64");
}