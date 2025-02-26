import type { NextFunction, Request, Response } from 'express';
import { PublicKey, TransactionExpiredBlockheightExceededError } from '@solana/web3.js';
import { HttpException } from '../../utils/errors.js';
import { DEFAULT_CARD_TIMEFRAME, DEFAULT_CARD_TIMEFRAME_LIMIT, DEFAULT_CARD_TIMEFRAME_RESET, DEFAULT_CARD_TRANSACTION_LIMIT } from '../../config/constants.js';
import { buildTransaction } from '../../utils/helpers.js';
import { connection, quartzClient } from '../../index.js';
import { Controller } from '../../types/controller.class.js';

export class ConfirmTxController extends Controller {
    private readonly MAX_DURATION = 70; // 70 second maximum in Vercel

    public confirmTx = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const signature = req.query.signature as string;
            if (!signature) {
                throw new HttpException(400, "Transaction signature is required");
            }

            const CONFIRMATION_METHOD_DURATION = 50_000; // Allow enough time for confirmTransaction to timeout
            const startTime = Date.now();
            const maxDurationMs = this.MAX_DURATION * 1_000;

            let lastError: any = null;
            while (Date.now() - startTime < (maxDurationMs - CONFIRMATION_METHOD_DURATION)) {
                try {
                    const result = await connection.confirmTransaction({
                        signature,
                        ...(await connection.getLatestBlockhash())
                    }, "confirmed");
                    const success = result.value.err === null;

                    res.status(200).json({
                        signature: signature,
                        success: success,
                        timeout: false,
                    });
                } catch (error) {
                    lastError = error;
                }
            }

            if (lastError instanceof TransactionExpiredBlockheightExceededError) {
                res.status(404).json({
                    signature: signature,
                    success: false,
                    timeout: true
                });
            }

            console.error(lastError);
            res.status(500).json({ error: `Internal server error: ${lastError}` });
            return;
        } catch (error) {
            this.getLogger().error(`Error confirming transaction: ${error}`);
            next(error);
        }
    }

    async initAccount(req: Request, res: Response, next: NextFunction) {
        try {
            const address = new PublicKey(req.query.address as string);
            if (!address) {
                throw new HttpException(400, "Wallet address is required");
            }

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

            const serializedTx = Buffer.from(transaction.serialize()).toString("base64");
            res.status(200).json({ transaction: serializedTx });
            return;

        } catch (error) {
            console.error(error);
            next(error);
        }
    }
}