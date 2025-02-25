import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { VersionedTransaction } from '@solana/web3.js';
import { retryWithBackoff } from '@quartz-labs/sdk';
import { BaseProgramController } from './baseProgram.controller.js';
import { HttpException } from '../../utils/errors.js';

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

export class SendTxController extends BaseProgramController {

    public sendTransaction = async (req: Request, res: Response, next: NextFunction): Promise<void> => {

        let body: z.infer<typeof transactionSchema>;
        try {
            body = transactionSchema.parse(req.body);
        } catch (error) {
            throw new HttpException(400, "Invalid transaction");
        }

        try {
            const signature = await retryWithBackoff(
                async () => this.connection.sendRawTransaction(body.transaction, {
                    skipPreflight: body.skipPreflight,
                }),
                3
            );
            res.status(200).json({ signature });
        } catch (error) {
            console.error(error);
            throw new HttpException(500, "Internal server error");
        }
    }
}