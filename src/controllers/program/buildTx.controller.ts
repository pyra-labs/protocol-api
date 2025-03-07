import type { NextFunction, Request, Response } from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import { HttpException } from '../../utils/errors.js';
import { buildAdjustSpendLimitTransaction } from './build-tx/adjustSpendLimit.js';
import { Controller } from '../../types/controller.class.js';
import { QuartzClient, type MarketIndex } from '@quartz-labs/sdk';
import { SwapMode } from '@jup-ag/api';
import config from '../../config/config.js';
import { buildDepositTransaction } from './build-tx/deposit.js';
import { buildInitAccountTransaction } from './build-tx/initAccount.js';
import { buildUpgradeAccountTransaction } from './build-tx/upgradeAccount.js';
import { buildWithdrawTransaction } from './build-tx/withdraw.js';
import { buildCollateralRepayTransaction } from './build-tx/collateralRepay.js';
import { buildCloseAccountTransaction } from './build-tx/closeAccount.js';


export class BuildTxController extends Controller {
    private connection: Connection;
    private quartzClientPromise: Promise<QuartzClient>;

    constructor() {
        super();
        this.connection = new Connection(config.RPC_URL);
        this.quartzClientPromise = QuartzClient.fetchClient(this.connection);
    }

    public adjustSpendLimit = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const quartzClient = await this.quartzClientPromise || QuartzClient.fetchClient(this.connection);    

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
                quartzClient
            );
            
            res.status(200).json({ transaction: serializedTx });
            return;
        } catch (error) {
            next(error);
        }
    }

    async initAccount(req: Request, res: Response, next: NextFunction) {
        try {
            const address = new PublicKey(req.query.address as string);
            if (!address) {
                throw new HttpException(400, "Wallet address is required");
            }

            const quartzClient = await this.quartzClientPromise || QuartzClient.fetchClient(this.connection);    
            const serializedTx = await buildInitAccountTransaction(
                address,
                this.connection,
                quartzClient
            );

            res.status(200).json({ transaction: serializedTx });
            return;

        } catch (error) {
            next(error);
        }
    }


    async closeAccount(req: Request, res: Response, next: NextFunction) {
        try {
            const quartzClient = await this.quartzClientPromise || QuartzClient.fetchClient(this.connection);    

            const address = new PublicKey(req.query.address as string);
            if (!address) {
                throw new HttpException(400, "Wallet address is required");
            }

            const serializedTx = await buildCloseAccountTransaction(
                address,
                this.connection,
                quartzClient
            );
            
            res.status(200).json({ transaction: serializedTx });
            return;
        } catch (error) {
            next(error);
        }
    }

    async collateralRepay(req: Request, res: Response, next: NextFunction) {
        try {
            const quartzClient = await this.quartzClientPromise || QuartzClient.fetchClient(this.connection);    

            const address = new PublicKey(req.query.address as string);
            if (!address) {
                throw new HttpException(400, "Wallet address is required");
            }

            const amountSwapBaseUnits = Number(req.query.amountSwapBaseUnits);
            if (!amountSwapBaseUnits) {
                throw new HttpException(400, "Amount swap base units is required");
            }

            const marketIndexLoan = Number(req.query.marketIndexLoan) as MarketIndex;
            if (!marketIndexLoan) {
                throw new HttpException(400, "Market index loan is required");
            }

            const marketIndexCollateral = Number(req.query.marketIndexCollateral) as MarketIndex;
            if (!marketIndexCollateral) {
                throw new HttpException(400, "Market index collateral is required");
            }

            const swapMode = req.query.swapMode as SwapMode;
            if (!swapMode) {
                throw new HttpException(400, "Swap mode is required");
            }

            const useMaxAmount = (req.query.useMaxAmount as string) === "true";
            if (!useMaxAmount) {
                throw new HttpException(400, "Use max amount is required");
            }

            const serializedTx = await buildCollateralRepayTransaction(
                address,
                amountSwapBaseUnits,
                marketIndexLoan,
                marketIndexCollateral,
                swapMode,
                useMaxAmount,
                this.connection,
                config.FLASH_LOAN_CALLER,
                quartzClient
            );
            
            res.status(200).json({ transaction: serializedTx });
            return;
        } catch (error) {
            next(error);
        }
    }

    deposit = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const address = new PublicKey(req.query.address as string);
            if (!address) {
                throw new HttpException(400, "Wallet address is required");
            }

            const amountBaseUnits = Number(req.query.amountBaseUnits);
            if (!amountBaseUnits) {
                throw new HttpException(400, "Amount base units is required");
            }

            const marketIndex = Number(req.query.marketIndex) as MarketIndex;
            if (!marketIndex) {
                throw new HttpException(400, "Market index is required");
            }

            const repayingLoan = req.query.repayingLoan === "true";
            if (repayingLoan === undefined || repayingLoan === null) {
                throw new HttpException(400, "Repaying loan is required");
            }

            const useMaxAmount = (req.query.useMaxAmount as string) === "true";
            if (!useMaxAmount) {
                throw new HttpException(400, "Use max amount is required");
            }

            const quartzClient = await this.quartzClientPromise || QuartzClient.fetchClient(this.connection);

            const serializedTx = await buildDepositTransaction(
                address,
                amountBaseUnits,
                marketIndex,
                repayingLoan,
                useMaxAmount,
                this.connection,
                quartzClient
            );
            
            res.status(200).json({ transaction: serializedTx });
            return;
        } catch (error) {
            next(error);
        }
    }

    async upgradeAccount(req: Request, res: Response, next: NextFunction) {
        try {
            const address = new PublicKey(req.query.address as string);
            if (!address) {
                throw new HttpException(400, "Wallet address is required");
            }

            const quartzClient = await this.quartzClientPromise || QuartzClient.fetchClient(this.connection);    
            const serializedTx = await buildUpgradeAccountTransaction(
                address,
                this.connection,
                quartzClient
            );

            res.status(200).json({ transaction: serializedTx });
            return;

        } catch (error) {
            next(error);
        }
    }

    withdraw = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const address = new PublicKey(req.query.address as string);
            if (!address) {
                throw new HttpException(400, "Wallet address is required");
            }

            const amountBaseUnits = Number(req.query.amountBaseUnits);
            if (!amountBaseUnits) {
                throw new HttpException(400, "Amount base units is required");
            }

            const marketIndex = Number(req.query.marketIndex) as MarketIndex;
            if (!marketIndex) {
                throw new HttpException(400, "Market index is required");
            }

            const allowLoan = req.query.allowLoan === "true";
            if (allowLoan === undefined || allowLoan === null) {
                throw new HttpException(400, "Allow loan is required");
            }

            const useMaxAmount = req.query.useMaxAmount === "true";
            if (useMaxAmount === undefined || useMaxAmount === null) {
                throw new HttpException(400, "Use max amount is required");
            }

            const quartzClient = await this.quartzClientPromise || QuartzClient.fetchClient(this.connection);    
            const serializedTx = await buildWithdrawTransaction(
                address,
                amountBaseUnits,
                marketIndex,
                allowLoan,
                useMaxAmount,
                this.connection,
                quartzClient
            );
            
            res.status(200).json({ transaction: serializedTx });
            return;
        } catch (error) {
            next(error);
        }
    }
}