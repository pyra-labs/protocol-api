import type { Connection, PublicKey } from '@solana/web3.js';
import { BN, type QuartzClient, type QuartzUser } from '@quartz-labs/sdk';
import { buildTransaction } from '../../../utils/helpers.js';
import { HttpException } from "../../../utils/errors.js";
import { SpendLimitTimeframe } from '../../../types/enums/SpendLimitTimeframe.enum.js';

export const buildAdjustSpendLimitTransaction = async (
    address: PublicKey,
    spendLimitTransactionBaseUnits: number,
    spendLimitTimeframeBaseUnits: number,
    spendLimitTimeframe: number,
    connection: Connection,
    quartzClient: QuartzClient
): Promise<string> => {
    const spendLimitTimeframeTyped = spendLimitTimeframe as SpendLimitTimeframe;
    const nextTimeframeResetTimestamp = getNextTimeframeReset(spendLimitTimeframeTyped);

    let user: QuartzUser;
    try {
        user = await quartzClient.getQuartzAccount(address);
    } catch {
        throw new HttpException(400, "User not found");
    }

    const { 
        ixs,
        lookupTables,
        signers
    } = await user.makeInitiateSpendLimitsIxs(
        new BN(spendLimitTransactionBaseUnits),
        new BN(spendLimitTimeframeBaseUnits),
        new BN(spendLimitTimeframe),
        new BN(nextTimeframeResetTimestamp)
    );

    const transaction = await buildTransaction(connection, ixs, address, lookupTables);
    transaction.sign(signers);
    
    return Buffer.from(transaction.serialize()).toString("base64");
}

const getNextTimeframeReset = (timeframe: SpendLimitTimeframe): number => {
    const reset = new Date();

    switch (timeframe) {    
        case SpendLimitTimeframe.DAY:
            reset.setUTCDate(reset.getUTCDate() + 1);
            reset.setUTCHours(0, 0, 0, 0);
            break;

        case SpendLimitTimeframe.WEEK:
            reset.setUTCDate(reset.getUTCDate() + ((8 - reset.getUTCDay()) % 7 || 7)); // Get next Monday
            reset.setUTCHours(0, 0, 0, 0);
            break;

        case SpendLimitTimeframe.MONTH:
            reset.setUTCMonth(reset.getUTCMonth() + 1); // Automatically handles rollover to next year
            reset.setUTCDate(1);
            reset.setUTCHours(0, 0, 0, 0);
            break;

        case SpendLimitTimeframe.YEAR:
            reset.setUTCFullYear(reset.getUTCFullYear() + 1);
            reset.setUTCMonth(0);
            reset.setUTCDate(1);
            reset.setUTCHours(0, 0, 0, 0);
            break;

        default:
            throw new Error("Invalid spend limit timeframe");
    }

    return Math.trunc(reset.getTime() / 1000); // Convert milliseconds to seconds
}