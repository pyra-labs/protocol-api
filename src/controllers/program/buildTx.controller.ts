import type { NextFunction, Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import { HttpException } from '../../utils/errors.js';
import { buildAdjustSpendLimitTransaction } from './build-tx/adjustSpendLimit.js';
import { Controller } from '../../types/controller.class.js';
import { QuartzClient, MarketIndex } from '@quartz-labs/sdk';
import { SwapMode } from '@jup-ag/api';
import config from '../../config/config.js';
import { buildInitAccountTransaction } from './build-tx/initAccount.js';
import { buildUpgradeAccountTransaction } from './build-tx/upgradeAccount.js';
import { buildWithdrawTransaction } from './build-tx/withdraw.js';
import { buildCollateralRepayTransaction } from './build-tx/collateralRepay.js';
import AdvancedConnection from '@quartz-labs/connection';
import { z } from "zod";
import { validateParams } from '../../utils/helpers.js';

export class BuildTxController extends Controller {
    private connection: AdvancedConnection;
    private quartzClientPromise: Promise<QuartzClient>;

    constructor() {
        super();
        this.connection = new AdvancedConnection(config.RPC_URLS);
        this.quartzClientPromise = QuartzClient.fetchClient({ connection: this.connection });
    }

    public adjustSpendLimit = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const quartzClient = await this.quartzClientPromise;

            const paramsSchema = z.object({
                address: z.string({
                    required_error: "Wallet address is required",
                    invalid_type_error: "Wallet address must be a string"
                }).refine((str) => {
                    try {
                        new PublicKey(str);
                        return true;
                    } catch {
                        return false;
                    }
                }, {
                    message: "Wallet address is not a valid Solana public key"
                }).transform(str => new PublicKey(str)),
                spendLimitTransactionBaseUnits: z.coerce.number({
                    required_error: "Spend limit transaction base units is required",
                    invalid_type_error: "Spend limit transaction base units must be a number"
                }),
                spendLimitTimeframeBaseUnits: z.coerce.number({
                    required_error: "Spend limit timeframe base units is required",
                    invalid_type_error: "Spend limit timeframe base units must be a number"
                }),
                spendLimitTimeframe: z.coerce.number({
                    required_error: "Spend limit timeframe is required",
                    invalid_type_error: "Spend limit timeframe must be a number"
                })
            });

            const { address, spendLimitTransactionBaseUnits, spendLimitTimeframeBaseUnits, spendLimitTimeframe } =
                await validateParams(paramsSchema, req);

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
            const paramsSchema = z.object({
                address: z.string({
                    required_error: "Wallet address is required",
                    invalid_type_error: "Wallet address must be a string"
                }).refine((str) => {
                    try {
                        new PublicKey(str);
                        return true;
                    } catch {
                        return false;
                    }
                }, {
                    message: "Wallet address is not a valid Solana public key"
                }).transform(str => new PublicKey(str))
            });

            const { address } = await validateParams(paramsSchema, req);

            const quartzClient = await this.quartzClientPromise;
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

    async collateralRepay(req: Request, res: Response, next: NextFunction) {
        try {
            const quartzClient = await this.quartzClientPromise;

            const paramsSchema = z.object({
                address: z.string({
                    required_error: "Wallet address is required",
                    invalid_type_error: "Wallet address must be a string"
                }).refine((str) => {
                    try {
                        new PublicKey(str);
                        return true;
                    } catch {
                        return false;
                    }
                }, {
                    message: "Wallet address is not a valid Solana public key"
                }).transform(str => new PublicKey(str)),
                amountSwapBaseUnits: z.coerce.number({
                    required_error: "Amount swap base units is required",
                    invalid_type_error: "Amount swap base units must be a number"
                }),
                marketIndexLoan: z.coerce.number({
                    required_error: "Market index loan is required",
                    invalid_type_error: "Market index loan must be a number"
                }).refine((val): val is MarketIndex => {
                    return Object.values(MarketIndex).includes(val as MarketIndex);
                }, {
                    message: "Invalid market index loan value"
                }),
                marketIndexCollateral: z.coerce.number({
                    required_error: "Market index collateral is required",
                    invalid_type_error: "Market index collateral must be a number"
                }).refine((val): val is MarketIndex => {
                    return Object.values(MarketIndex).includes(val as MarketIndex);
                }, {
                    message: "Invalid market index collateral value"
                }),
                swapMode: z.string({
                    required_error: "Swap mode is required",
                    invalid_type_error: "Swap mode must be a string"
                }).refine((val): val is SwapMode => {
                    return Object.values(SwapMode).includes(val as SwapMode);
                }, {
                    message: "Invalid swap mode value"
                }),
                useMaxAmount: z.string({
                    required_error: "Use max amount is required",
                    invalid_type_error: "Use max amount must be a string"
                })
                .refine((val) => val === "true" || val === "false", {
                    message: "Use max amount must be either 'true' or 'false'"
                })
                .transform((val) => val === "true")
            });

            const {
                address,
                amountSwapBaseUnits,
                marketIndexLoan,
                marketIndexCollateral,
                swapMode,
                useMaxAmount
            } = await validateParams(paramsSchema, req);

            const serializedTx = await buildCollateralRepayTransaction(
                address,
                amountSwapBaseUnits,
                marketIndexLoan,
                marketIndexCollateral,
                swapMode,
                this.connection,
                config.FLASH_LOAN_CALLER,
                quartzClient,
                useMaxAmount
            );

            res.status(200).json({ transaction: serializedTx });
            return;
        } catch (error) {
            next(error);
        }
    }

    async upgradeAccount(req: Request, res: Response, next: NextFunction) {
        try {
            const paramsSchema = z.object({
                address: z.string({
                    required_error: "Wallet address is required",
                    invalid_type_error: "Wallet address must be a string"
                }).refine((str) => {
                    try {
                        new PublicKey(str);
                        return true;
                    } catch {
                        return false;
                    }
                }, {
                    message: "Wallet address is not a valid Solana public key"
                }).transform(str => new PublicKey(str))
            });

            const { address } = await validateParams(paramsSchema, req);

            const quartzClient = await this.quartzClientPromise;
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
            const paramsSchema = z.object({
                address: z.string({
                    required_error: "Wallet address is required",
                    invalid_type_error: "Wallet address must be a string"
                }).refine((str) => {
                    try {
                        new PublicKey(str);
                        return true;
                    } catch {
                        return false;
                    }
                }, {
                    message: "Wallet address is not a valid Solana public key"
                }).transform(str => new PublicKey(str)),
                amountBaseUnits: z.coerce.number({
                    required_error: "Amount base units is required",
                    invalid_type_error: "Amount base units must be a number"
                }),
                marketIndex: z.coerce.number({
                    required_error: "Market index is required",
                    invalid_type_error: "Market index must be a number"
                }).refine((val): val is MarketIndex => {
                    return Object.values(MarketIndex).includes(val as MarketIndex);
                }, {
                    message: "Invalid market index value"
                }),
                allowLoan: z.string({
                    required_error: "Allow loan is required",
                    invalid_type_error: "Allow loan must be a string"
                }).transform((val) => val === "true"),
                useMaxAmount: z.string({
                    required_error: "Use max amount is required",
                    invalid_type_error: "Use max amount must be a string"
                })
                .refine((val) => val === "true" || val === "false", {
                    message: "Use max amount must be either 'true' or 'false'"
                })
                .transform((val) => val === "true")
            });

            const { 
                address, 
                amountBaseUnits, 
                marketIndex, 
                allowLoan, 
                useMaxAmount 
            } = await validateParams(paramsSchema, req);

            const quartzClient = await this.quartzClientPromise;
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