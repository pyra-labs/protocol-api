import { Connection, PublicKey } from '@solana/web3.js';
import { QuartzClient, QuartzUser } from '@quartz-labs/sdk';
import { HttpException } from '../../../utils/errors.js';
import { buildTransaction } from '../../../utils/helpers.js';
export const buildCloseAccountTransaction = async (address, connection, quartzClient) => {
    const client = quartzClient || await QuartzClient.fetchClient(connection);
    let user;
    try {
        user = await client.getQuartzAccount(address);
    }
    catch {
        throw new HttpException(400, "User not found");
    }
    const { ixs, lookupTables, signers } = await user.makeCloseAccountIxs();
    const transaction = await buildTransaction(connection, ixs, address, lookupTables);
    transaction.sign(signers);
    return Buffer.from(transaction.serialize()).toString("base64");
};
//# sourceMappingURL=closeAccount.js.map