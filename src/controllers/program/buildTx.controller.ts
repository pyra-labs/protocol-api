import type { NextFunction, Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import { BaseProgramController } from './baseProgram.controller.js';
import { HttpException } from '../../utils/errors.js';
import { buildAdjustSpendLimitTransaction } from './build-tx/adjustSpendLimit.js';
import { DEFAULT_CARD_TIMEFRAME, DEFAULT_CARD_TIMEFRAME_LIMIT, DEFAULT_CARD_TIMEFRAME_RESET, DEFAULT_CARD_TRANSACTION_LIMIT } from '../../config/constants.js';
import { buildTransaction } from '../../utils/helpers.js';

export class BuildTxController extends BaseProgramController {

    public buildSpendLimitTx = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const address = new PublicKey(req.query.address as string);
            if (!address) {
                throw new HttpException(400, "Wallet address is required");
            }

            const spendLimitTransactionBaseUnits = Number(req.query.spendLimitTransactionBaseUnits);
            if (!spendLimitTransactionBaseUnits) {
                throw new HttpException(400, "Spend limit transaction base units is required");
            }

            const spendLimitTimeframeBaseUnits = Number(req.query.spendLimitTimeframeBaseUnits);
            if (!spendLimitTimeframeBaseUnits) {
                throw new HttpException(400, "Spend limit timeframe base units is required");
            }

            let spendLimitTimeframe = Number(req.query.spendLimitTimeframe);
            if (!spendLimitTimeframe) {
                throw new HttpException(400, "Spend limit timeframe is required");
            }

            const serializedTx = await buildAdjustSpendLimitTransaction(
                address,
                spendLimitTransactionBaseUnits,
                spendLimitTimeframeBaseUnits,
                spendLimitTimeframe,
                this.connection,
                await this.quartzClientPromise
            );
            
            res.status(200).json({ transaction: serializedTx });
            return;
        } catch (error) {
            this.getLogger().error(`Error building transaction: ${error}`);
            next(error);
        }
    }

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