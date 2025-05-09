import type { NextFunction, Request, Response } from 'express';
import { TransactionExpiredBlockheightExceededError, VersionedTransaction } from '@solana/web3.js';
import { HttpException } from '../../utils/errors.js';
import { Controller } from '../../types/controller.class.js';
import { retryWithBackoff } from '@quartz-labs/sdk';
import { z } from 'zod';
import config from '../../config/config.js';
import AdvancedConnection from '@quartz-labs/connection';

const transactionSchema = z.object({
    transaction: z.string()
        .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Must be a valid base64 string')
        .transform((val) => {
            const buffer = Buffer.from(val, 'base64');
            VersionedTransaction.deserialize(buffer); // Validate it's a valid VersionedTransaction
            return buffer;
        }),
    skipPreflight: z.boolean().optional().default(false),
});

export class TxController extends Controller {
    private readonly MAX_DURATION = 70; // 70 second maximum in Vercel
    private connection: AdvancedConnection;

    constructor() {
        super();
        this.connection = new AdvancedConnection(config.RPC_URLS);
    }

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
                    const result = await this.connection.confirmTransaction({
                        signature,
                        ...(await this.connection.getLatestBlockhash())
                    }, "confirmed");
                    const success = result.value.err === null;

                    res.status(200).json({
                        signature: signature,
                        success: success,
                        timeout: false,
                    });
                    return;
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
                return;
            }

            console.error(lastError);
            res.status(500).json({ error: `Internal server error: ${lastError}` });
            return;
        } catch (error) {
            next(error);
        }
    }

    public sendTransaction = async (req: Request, res: Response, next: NextFunction): Promise<void> => {

        let body: z.infer<typeof transactionSchema>;
        try {
            body = transactionSchema.parse(req.body);
        } catch {
            throw new HttpException(400, "Invalid transaction");
        }

        try {
            const signature = await retryWithBackoff(
                async () => this.connection.sendRawTransaction(body.transaction, {
                    skipPreflight: body.skipPreflight,
                }),
                3
            );

            console.log("Signature", signature);
            res.status(200).json({ signature });
        } catch (error) {
            console.error(error);
            next(error);
        }
    }
}