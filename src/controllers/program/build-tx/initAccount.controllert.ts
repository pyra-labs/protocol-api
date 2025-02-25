import { PublicKey } from '@solana/web3.js';
import { HttpException } from '../../../utils/errors.js';
import type { NextFunction, Request, Response } from 'express';
import { buildTransaction } from '../../../utils/helpers.js';
import { BaseProgramController } from '../baseProgram.controller.js';
import { DEFAULT_CARD_TIMEFRAME_RESET, DEFAULT_CARD_TIMEFRAME, DEFAULT_CARD_TIMEFRAME_LIMIT, DEFAULT_CARD_TRANSACTION_LIMIT } from '../../../config/constants.js';

export class InitAccountController extends BaseProgramController {
    async initAccount(req: Request, res: Response, next: NextFunction) {
        try {
            const address = new PublicKey(req.query.address as string);
            if (!address) {
                throw new HttpException(400, "Wallet address is required");
            }
            const quartzClient = await this.quartzClientPromise;
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

            const transaction = await buildTransaction(this.connection, ixs, address, lookupTables);
            transaction.sign(signers);

            const serializedTx = Buffer.from(transaction.serialize()).toString("base64");
            res.status(200).json({ transaction: serializedTx });
            return;

        } catch (error) {
            console.error(error);
            next(error);
        }
    }
}
