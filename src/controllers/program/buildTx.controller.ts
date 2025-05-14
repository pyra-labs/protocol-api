import type { NextFunction, Request, Response } from 'express';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { HttpException } from '../../utils/errors.js';
import { buildAdjustSpendLimitTransaction } from './build-tx/adjustSpendLimit.js';
import { Controller } from '../../types/controller.class.js';
import { QuartzClient, MarketIndex, QuartzUser, isMarketIndex, TOKENS, MARKET_INDEX_SOL, getTokenProgram, makeCreateAtaIxIfNeeded, BN } from '@quartz-labs/sdk';
import { SwapMode } from '@jup-ag/api';
import config from '../../config/config.js';
import { buildUpgradeAccountTransaction } from './build-tx/upgradeAccount.js';
import { buildWithdrawTransaction } from './build-tx/withdraw.js';
import { buildCollateralRepayTransaction } from './build-tx/collateralRepay.js';
import AdvancedConnection from '@quartz-labs/connection';
import { z } from "zod";
import { buildTransaction, getNextTimeframeReset, validateParams } from '../../utils/helpers.js';
import { SpendLimitTimeframe } from '../../types/enums/SpendLimitTimeframe.enum.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';

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
                spendLimitTransactionBaseUnits: z.coerce.number().refine(
                    Number.isInteger,
                    { message: "spendLimitTransactionBaseUnits must be an integer" }
                ),
                spendLimitTimeframeBaseUnits: z.coerce.number().refine(
                    Number.isInteger,
                    { message: "spendLimitTimeframeBaseUnits must be an integer" }
                ),
                spendLimitTimeframe: z.coerce.number().refine(
                    (value): value is SpendLimitTimeframe => {
                        return Object.values(SpendLimitTimeframe).includes(value as SpendLimitTimeframe);
                    },
                    { message: "spendLimitTimeframe must be a valid SpendLimitTimeframe value" }
                ),
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
                }).transform(str => new PublicKey(str)),
                spendLimitTransactionBaseUnits: z.string().refine(
                    (value) => {
                        const num = Number(value);
                        return !isNaN(num) && num >= 0;
                    },
                    { message: "spendLimitTransactionBaseUnits must be a non-negative number" }
                ).transform(value => Number(value)),
                spendLimitTimeframeBaseUnits: z.string().refine(
                    (value) => {
                        const num = Number(value);
                        return !isNaN(num) && num >= 0;
                    },
                    { message: "spendLimitTimeframeBaseUnits must be a non-negative number" }
                ).transform(value => Number(value)),
                spendLimitTimeframe: z.string().refine(
                    (value) => {
                        return Object.values(SpendLimitTimeframe).filter(v => typeof v === 'number').includes(Number(value));
                    },
                    { message: "spendLimitTimeframe must be a valid SpendLimitTimeframe" }
                ).transform(value => Number(value) as SpendLimitTimeframe),
            });

            const { address, spendLimitTransactionBaseUnits, spendLimitTimeframeBaseUnits, spendLimitTimeframe } = await validateParams(paramsSchema, req);

            const nextTimeframeResetTimestamp = getNextTimeframeReset(spendLimitTimeframe);

            const quartzClient = await this.quartzClientPromise;

            const {
                ixs,
                lookupTables,
                signers
            } = await quartzClient.makeInitQuartzUserIxs(
                address,
                new BN(spendLimitTransactionBaseUnits),
                new BN(spendLimitTimeframeBaseUnits),
                new BN(spendLimitTimeframe),
                new BN(nextTimeframeResetTimestamp)
            );

            const transaction = await buildTransaction(this.connection, ixs, address, lookupTables);
            transaction.sign(signers);

            const serializedTx = Buffer.from(transaction.serialize()).toString("base64");

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
                address: z.string().refine(
                    (value) => {
                        try {
                            new PublicKey(value);
                            return true;
                        } catch {
                            return false;
                        }
                    },
                    { message: "Address is not a valid public key" }
                ).transform(str => new PublicKey(str)),
                amountSwapBaseUnits: z.coerce.number().refine(
                    Number.isInteger,
                    { message: "amountLoanBaseUnits must be an integer" }
                ),
                marketIndexLoan: z.coerce.number().refine(
                    (value) => MarketIndex.includes(value as any),
                    { message: "marketIndexLoan must be a valid market index" }
                ).transform(val => val as MarketIndex),
                marketIndexCollateral: z.coerce.number().refine(
                    (value) => MarketIndex.includes(value as any),
                    { message: "marketIndexCollateral must be a valid market index" }
                ).transform(val => val as MarketIndex),
                swapMode: z.nativeEnum(SwapMode),
                useMaxAmount: z.boolean().optional().default(false),
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

    cancelWithdraw = async (req: Request, res: Response, next: NextFunction) => {
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
                order: z.string().refine(
                    (value: string) => {
                        try {
                            new PublicKey(value);
                            return true;
                        } catch {
                            return false;
                        }
                    },
                    { message: "Order is not a valid public key" }
                ).transform(str => new PublicKey(str))
            });

            const {
                address,
                order
            } = await validateParams(paramsSchema, req);

            const quartzClient = await this.quartzClientPromise;
            let user: QuartzUser;
            try {
                user = await quartzClient.getQuartzAccount(address);
            } catch {
                throw new HttpException(400, "User not found");
            }

            const {
                ixs,
                lookupTables,
                signers
            } = await user.makeCancelWithdrawIxs(
                order
            );

            const transaction = await buildTransaction(
                this.connection,
                ixs,
                address,
                lookupTables
            );
            transaction.sign(signers);

            const serializedTx = Buffer.from(transaction.serialize()).toString("base64");

            res.status(200).json({ transaction: serializedTx });
            return;
        } catch (error) {
            next(error);
        }
    }

    fulfilWithdraw = async (req: Request, res: Response, next: NextFunction) => {
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
                order: z.string().refine(
                    (value: string) => {
                        try {
                            new PublicKey(value);
                            return true;
                        } catch {
                            return false;
                        }
                    },
                    { message: "Order is not a valid public key" }
                ).transform(str => new PublicKey(str))
            });

            const {
                address,
                order
            } = await validateParams(paramsSchema, req);

            const quartzClient = await this.quartzClientPromise;
            let user: QuartzUser;
            try {
                user = await quartzClient.getQuartzAccount(address);
            } catch {
                throw new HttpException(400, "User not found");
            }

            const orderAccount = await quartzClient.parseOpenWithdrawOrder(order);
            const marketIndex = orderAccount.driftMarketIndex.toNumber() as MarketIndex;
            if (!isMarketIndex(marketIndex)) throw new Error("Invalid market index");


            // Create ATA for destination if needed (wSOL is already unwrapped)
            let oix_createAta: TransactionInstruction[] = [];
            const mint = TOKENS[marketIndex].mint;
            if (mint !== TOKENS[MARKET_INDEX_SOL].mint) {
                const destination = orderAccount.destination;
                const mintTokenProgram = await getTokenProgram(this.connection, mint);
                const ata = getAssociatedTokenAddressSync(mint, destination, true, mintTokenProgram);
                oix_createAta = await makeCreateAtaIxIfNeeded(this.connection, ata, destination, mint, mintTokenProgram);
            }

            const {
                ixs,
                lookupTables,
                signers
            } = await user.makeFulfilWithdrawIxs(
                order,
                address
            );

            const transaction = await buildTransaction(
                this.connection,
                [...oix_createAta, ...ixs],
                address,
                lookupTables
            );
            transaction.sign(signers);

            const serializedTx = Buffer.from(transaction.serialize()).toString("base64");

            res.status(200).json({ transaction: serializedTx });
            return;
        } catch (error) {
            next(error);
        }
    }

    fulfilSpendLimit = async (req: Request, res: Response, next: NextFunction) => {
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
                order: z.string().refine(
                    (value: string) => {
                        try {
                            new PublicKey(value);
                            return true;
                        } catch {
                            return false;
                        }
                    },
                    { message: "Order is not a valid public key" }
                ).transform(str => new PublicKey(str))
            });

            const {
                address,
                order
            } = await validateParams(paramsSchema, req);

            const quartzClient = await this.quartzClientPromise;
            let user: QuartzUser;
            try {
                user = await quartzClient.getQuartzAccount(address);
            } catch {
                throw new HttpException(400, "User not found");
            }

            const {
                ixs,
                lookupTables,
                signers
            } = await user.makeFulfilSpendLimitsIxs(
                order,
                address
            );
            const transaction = await buildTransaction(this.connection, ixs, address, lookupTables);
            transaction.sign(signers);

            const serializedTx = Buffer.from(transaction.serialize()).toString("base64");

            res.status(200).json({ transaction: serializedTx });
            return;
        } catch (error) {
            next(error);
        }
    }

    increaseSpendLimits = async (req: Request, res: Response, next: NextFunction) => {
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
                spendLimitTransactionBaseUnits: z.coerce.number().refine(
                    Number.isInteger,
                    { message: "spendLimitTransactionBaseUnits must be an integer" }
                ),
                spendLimitTimeframeBaseUnits: z.coerce.number().refine(
                    Number.isInteger,
                    { message: "spendLimitTimeframeBaseUnits must be an integer" }
                ),
                spendLimitTimeframe: z.coerce.number().refine(
                    (value) => {
                        return Object.values(SpendLimitTimeframe).filter(v => typeof v === 'number').includes(value);
                    },
                    { message: "spendLimitTimeframe must be a valid SpendLimitTimeframe" }
                ),
            });

            const {
                address,
                spendLimitTransactionBaseUnits,
                spendLimitTimeframeBaseUnits,
                spendLimitTimeframe
            } = await validateParams(paramsSchema, req);

            const nextTimeframeResetTimestamp = getNextTimeframeReset(spendLimitTimeframe);

            const quartzClient = await this.quartzClientPromise;
            let user: QuartzUser;
            try {
                user = await quartzClient.getQuartzAccount(address);
            } catch {
                throw new HttpException(400, "User not found");
            }

            const {
                ixs,
                lookupTables,
                signers
            } = await user.makeIncreaseSpendLimitsIxs(
                new BN(spendLimitTransactionBaseUnits),
                new BN(spendLimitTimeframeBaseUnits),
                new BN(spendLimitTimeframe),
                new BN(nextTimeframeResetTimestamp)
            );

            const transaction = await buildTransaction(this.connection, ixs, address, lookupTables);
            transaction.sign(signers);

            const serializedTx = Buffer.from(transaction.serialize()).toString("base64");

            res.status(200).json({ transaction: serializedTx });
            return;
        } catch (error) {
            next(error);
        }
    }

}