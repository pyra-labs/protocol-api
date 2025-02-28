import { Connection, PublicKey } from '@solana/web3.js';
import { QuartzClient } from '@quartz-labs/sdk';
import { buildTransaction } from '../../../utils/helpers.js';
import { DEFAULT_CARD_TRANSACTION_LIMIT, DEFAULT_CARD_TIMEFRAME, DEFAULT_CARD_TIMEFRAME_LIMIT, DEFAULT_CARD_TIMEFRAME_RESET } from '../../../config/constants.js';


export const buildInitAccountTransaction = async (
    address: PublicKey,
    connection: Connection,
    quartzClient: QuartzClient
): Promise<string> => {
    const {
        ixs,
        lookupTables,
        signers
    } = await quartzClient.makeInitQuartzUserIxs(
        address,
        DEFAULT_CARD_TRANSACTION_LIMIT,
        DEFAULT_CARD_TIMEFRAME_LIMIT,
        DEFAULT_CARD_TIMEFRAME,
        DEFAULT_CARD_TIMEFRAME_RESET
    );

    const transaction = await buildTransaction(connection, ixs, address, lookupTables);
    transaction.sign(signers);

    return Buffer.from(transaction.serialize()).toString("base64");
}