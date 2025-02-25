import type { NextFunction, Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import { BN, QuartzUser } from '@quartz-labs/sdk';
import { buildTransaction } from '../../../utils/helpers.js';
import { HttpException } from "../../../utils/errors.js";
import { SpendLimitTimeframe } from '../../../types/enums/SpendLimitTimeframe.enum.js';
import { BaseProgramController } from '../baseProgram.controller.js';

export class AdjustSpendLimitController extends BaseProgramController {
    constructor() {
        super();
    }

    public buildSpendLimitTx = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const address = new PublicKey(req.query.address as string);
            if (!address) {
                return next(new HttpException(400, "Wallet address is required"));
            }

            const spendLimitTransactionBaseUnits = Number(req.query.spendLimitTransactionBaseUnits);
            if (!spendLimitTransactionBaseUnits) {
                return next(new HttpException(400, "Wallet address is required"));
            }

            const spendLimitTimeframeBaseUnits = Number(req.query.spendLimitTimeframeBaseUnits);
            if (!spendLimitTimeframeBaseUnits) {
                return next(new HttpException(400, "Wallet address is required"));
            }

            let spendLimitTimeframe = Number(req.query.spendLimitTimeframe);
            if (!spendLimitTimeframe) {
                return next(new HttpException(400, "Wallet address is required"));
            }

            const spendLimitTimeframeTyped = spendLimitTimeframe as SpendLimitTimeframe;

            const nextTimeframeResetTimestamp = this.getNextTimeframeReset(spendLimitTimeframeTyped);

            const quartzClient = await this.quartzClientPromise;
            let user: QuartzUser;
            try {
                user = await quartzClient.getQuartzAccount(address);
            } catch {
                return next(new HttpException(400, "User not found"));
            }

            const { 
                ixs,
                lookupTables,
                signers
            } = await user.makeAdjustSpendLimitsIxs(
                new BN(spendLimitTransactionBaseUnits),
                new BN(spendLimitTimeframeBaseUnits),
                new BN(spendLimitTimeframe),
                new BN(nextTimeframeResetTimestamp)
            );

            const transaction = await buildTransaction(this.connection, ixs, address, lookupTables);
            transaction.sign(signers);
            
            const serializedTx = Buffer.from(transaction.serialize()).toString("base64");
            return res.status(200).json({ transaction: serializedTx });
        } catch (error) {
            this.getLogger().error(`Error building transaction: ${error}`);
            next(error);
        }
    }

    private getNextTimeframeReset(timeframe: SpendLimitTimeframe): number {
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
}
