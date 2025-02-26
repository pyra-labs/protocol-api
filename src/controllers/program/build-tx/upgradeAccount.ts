import { PublicKey } from '@solana/web3.js';
import { QuartzClient, QuartzUser } from '@quartz-labs/sdk';
import { HttpException } from '../../../utils/errors.js';
import { connection, quartzClient } from '../../../index.js';
import { buildTransaction } from '../../../utils/helpers.js';
import { DEFAULT_CARD_TRANSACTION_LIMIT, DEFAULT_CARD_TIMEFRAME, DEFAULT_CARD_TIMEFRAME_LIMIT, DEFAULT_CARD_TIMEFRAME_RESET } from '../../../config/constants.js';

export const buildUpgradeAccountTransaction = async (
    address: PublicKey,
): Promise<string> => {
    const client = quartzClient || await QuartzClient.fetchClient(connection);

    let user: QuartzUser;
    try {
        user = await client.getQuartzAccount(address);
    } catch {
        throw new HttpException(400, "User not found");
    }

    const {
        ixs,
        lookupTables,
        signers
    } = await user.makeUpgradeAccountIxs(
        DEFAULT_CARD_TRANSACTION_LIMIT,
        DEFAULT_CARD_TIMEFRAME_LIMIT,
        DEFAULT_CARD_TIMEFRAME,
        DEFAULT_CARD_TIMEFRAME_RESET
    );

    const transaction = await buildTransaction(connection, ixs, address, lookupTables);
    transaction.sign(signers);

    return Buffer.from(transaction.serialize()).toString("base64");
}
