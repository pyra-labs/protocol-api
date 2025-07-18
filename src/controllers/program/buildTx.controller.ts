import type { NextFunction, Request, Response } from 'express';
import { PublicKey, type TransactionInstruction } from '@solana/web3.js';
import { HttpException } from '../../utils/errors.js';
import { buildAdjustSpendLimitTransaction } from './build-tx/adjustSpendLimit.js';
import { Controller } from '../../types/controller.class.js';
import { QuartzClient, MarketIndex, type QuartzUser, isMarketIndex, TOKENS, MARKET_INDEX_SOL, getTokenProgram, makeCreateAtaIxIfNeeded, BN, getTimeLockRentPayerPublicKey } from '@quartz-labs/sdk';
import { SwapMode } from '@jup-ag/api';
import config from '../../config/config.js';
import { buildWithdrawTransaction } from './build-tx/withdraw.js';
import { buildCollateralRepayTransaction } from './build-tx/collateralRepay.js';
import AdvancedConnection from '@quartz-labs/connection';
import { z } from "zod";
import { buildTransaction, getNextTimeframeReset, validateParams } from '../../utils/helpers.js';
import { SpendLimitTimeframe } from '../../types/enums/SpendLimitTimeframe.enum.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { DEFAULT_CARD_TIMEFRAME, DEFAULT_CARD_TIMEFRAME_LIMIT, DEFAULT_CARD_TIMEFRAME_RESET, DEFAULT_CARD_TRANSACTION_LIMIT, MIN_TIME_LOCK_RENT_PAYER_BALANCE } from '../../config/constants.js';

export class BuildTxController extends Controller {
    private connection: AdvancedConnection;
    private quartzClientPromise: Promise<QuartzClient>;

    constructor() {
        super();
        this.connection = new AdvancedConnection(config.RPC_URLS);
        this.quartzClientPromise = QuartzClient.fetchClient({ connection: this.connection });
    }

    adjustSpendLimit = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const quartzClient = await this.quartzClientPromise;

            const paramsSchema = z.object({
                user: z.string({
                    required_error: "User address is required",
                    invalid_type_error: "User address must be a string"
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

            const {
                user: userAddress,
                spendLimitTransactionBaseUnits,
                spendLimitTimeframeBaseUnits,
                spendLimitTimeframe
            } =
                await validateParams(paramsSchema, req);

            const serializedTx = await buildAdjustSpendLimitTransaction(
                userAddress,
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

    initAccount = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const paramsSchema = z.object({
                user: z.string({
                    required_error: "user is required",
                    invalid_type_error: "user must be a string"
                }).refine((str) => {
                    try {
                        new PublicKey(str);
                        return true;
                    } catch {
                        return false;
                    }
                }, {
                    message: "user is not a valid Solana public key"
                }).transform(str => new PublicKey(str)),
                spendLimitTransactionBaseUnits: z.string().refine(
                    (value) => {
                        const num = Number(value);
                        return !Number.isNaN(num) && num >= 0;
                    },
                    { message: "spendLimitTransactionBaseUnits must be a non-negative number" }
                ).transform(value => Number(value)),
                spendLimitTimeframeBaseUnits: z.string().refine(
                    (value) => {
                        const num = Number(value);
                        return !Number.isNaN(num) && num >= 0;
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

            const { user, spendLimitTransactionBaseUnits, spendLimitTimeframeBaseUnits, spendLimitTimeframe } = await validateParams(paramsSchema, req);

            const nextTimeframeResetTimestamp = getNextTimeframeReset(spendLimitTimeframe);

            const quartzClient = await this.quartzClientPromise;

            const {
                ixs,
                lookupTables,
                signers
            } = await quartzClient.makeInitQuartzUserIxs(
                user,
                new BN(spendLimitTransactionBaseUnits),
                new BN(spendLimitTimeframeBaseUnits),
                new BN(spendLimitTimeframe),
                new BN(nextTimeframeResetTimestamp)
            );

            const transaction = await buildTransaction(this.connection, ixs, user, lookupTables);
            transaction.sign(signers);

            const serializedTx = Buffer.from(transaction.serialize()).toString("base64");

            res.status(200).json({ transaction: serializedTx });
            return;

        } catch (error) {
            next(error);
        }
    }

    collateralRepay = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const quartzClient = await this.quartzClientPromise;

            const paramsSchema = z.object({
                user: z.string().refine(
                    (value) => {
                        try {
                            new PublicKey(value);
                            return true;
                        } catch {
                            return false;
                        }
                    },
                    { message: "User is not a valid public key" }
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
                useMaxAmount: z.string().optional().default("false")
                    .transform(val => val === "true")
            });

            const {
                user: userAddress,
                amountSwapBaseUnits,
                marketIndexLoan,
                marketIndexCollateral,
                swapMode,
                useMaxAmount
            } = await validateParams(paramsSchema, req);

            const serializedTx = await buildCollateralRepayTransaction(
                userAddress,
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

    upgradeAccount = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const paramsSchema = z.object({
                user: z.string({
                    required_error: "user is required",
                    invalid_type_error: "user must be a string"
                }).refine((str) => {
                    try {
                        new PublicKey(str);
                        return true;
                    } catch {
                        return false;
                    }
                }, {
                    message: "user is not a valid Solana public key"
                }).transform(str => new PublicKey(str))
            });

            const { user: userAddress } = await validateParams(paramsSchema, req);

            const quartzClient = await this.quartzClientPromise;

            let user: QuartzUser;
            try {
                user = await quartzClient.getQuartzAccount(userAddress);
            } catch {
                throw new HttpException(400, "User not found");
            }

            const {
                ixs,
                lookupTables,
                signers
            } = await user.makeUpgradeAccountIxs(
                DEFAULT_CARD_TRANSACTION_LIMIT,
                DEFAULT_CARD_TIMEFRAME_LIMIT,
                DEFAULT_CARD_TIMEFRAME,
                DEFAULT_CARD_TIMEFRAME_RESET
            );

            const transaction = await buildTransaction(this.connection, ixs, userAddress, lookupTables);
            transaction.sign(signers);

            const serializedTx = Buffer.from(transaction.serialize()).toString("base64");

            res.status(200).json({ transaction: serializedTx });
            return;

        } catch (error) {
            next(error);
        }
    }

    withdraw = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const paramsSchema = z.object({
                user: z.string({
                    required_error: "user is required",
                    invalid_type_error: "user must be a string"
                }).refine((str) => {
                    try {
                        new PublicKey(str);
                        return true;
                    } catch {
                        return false;
                    }
                }, {
                    message: "user is not a valid Solana public key"
                }).transform(str => new PublicKey(str)),
                amountBaseUnits: z.coerce.number().refine(
                    Number.isInteger,
                    { message: "amountBaseUnits must be an integer" }
                ),
                allowLoan: z.string().optional().default("false")
                    .transform(val => val === "true"),
                marketIndex: z.coerce.number().refine(
                    (value: number) => MarketIndex.includes(value as MarketIndex),
                    { message: "marketIndex must be a valid market index" }
                ).transform(val => val as MarketIndex),
                useMaxAmount: z.string({
                    required_error: "useMaxAmount is required",
                    invalid_type_error: "useMaxAmount must be a string"
                })
                    .optional()
                    .default("false")
                    .transform(val => val === "true"),
            });

            const {
                user,
                amountBaseUnits,
                marketIndex,
                allowLoan,
                useMaxAmount
            } = await validateParams(paramsSchema, req);

            console.log("Validated params");

            const quartzClient = await this.quartzClientPromise;
            const serializedTx = await buildWithdrawTransaction(
                user,
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
                user: z.string({
                    required_error: "user is required",
                    invalid_type_error: "user must be a string"
                }).refine((str) => {
                    try {
                        new PublicKey(str);
                        return true;
                    } catch {
                        return false;
                    }
                }, {
                    message: "user is not a valid Solana public key"
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
                user: userAddress,
                order
            } = await validateParams(paramsSchema, req);

            const quartzClient = await this.quartzClientPromise;
            let user: QuartzUser;
            try {
                user = await quartzClient.getQuartzAccount(userAddress);
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
                userAddress,
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
                user: z.string({
                    required_error: "user is required",
                    invalid_type_error: "user must be a string"
                }).refine((str) => {
                    try {
                        new PublicKey(str);
                        return true;
                    } catch {
                        return false;
                    }
                }, {
                    message: "user is not a valid Solana public key"
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
                user: userAddress,
                order
            } = await validateParams(paramsSchema, req);

            const quartzClient = await this.quartzClientPromise;
            let user: QuartzUser;
            try {
                user = await quartzClient.getQuartzAccount(userAddress);
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
                oix_createAta = await makeCreateAtaIxIfNeeded(
                    this.connection,
                    ata,
                    destination,
                    mint,
                    mintTokenProgram,
                    userAddress
                );
            }

            const {
                ixs,
                lookupTables,
                signers
            } = await user.makeFulfilWithdrawIxs(
                order,
                userAddress
            );

            const transaction = await buildTransaction(
                this.connection,
                [...oix_createAta, ...ixs],
                userAddress,
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
                user: z.string({
                    required_error: "user is required",
                    invalid_type_error: "user must be a string"
                }).refine((str) => {
                    try {
                        new PublicKey(str);
                        return true;
                    } catch {
                        return false;
                    }
                }, {
                    message: "user is not a valid Solana public key"
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
                user: userAddress,
                order
            } = await validateParams(paramsSchema, req);

            const quartzClient = await this.quartzClientPromise;
            let user: QuartzUser;
            try {
                user = await quartzClient.getQuartzAccount(userAddress);
            } catch {
                throw new HttpException(400, "User not found");
            }

            const {
                ixs,
                lookupTables,
                signers
            } = await user.makeFulfilSpendLimitsIxs(
                order,
                userAddress
            );
            const transaction = await buildTransaction(this.connection, ixs, userAddress, lookupTables);
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
                user: z.string({
                    required_error: "user is required",
                    invalid_type_error: "user must be a string"
                }).refine((str) => {
                    try {
                        new PublicKey(str);
                        return true;
                    } catch {
                        return false;
                    }
                }, {
                    message: "user is not a valid Solana public key"
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
                user: userAddress,
                spendLimitTransactionBaseUnits,
                spendLimitTimeframeBaseUnits,
                spendLimitTimeframe
            } = await validateParams(paramsSchema, req);

            const nextTimeframeResetTimestamp = getNextTimeframeReset(spendLimitTimeframe);

            const quartzClient = await this.quartzClientPromise;
            let user: QuartzUser;
            try {
                user = await quartzClient.getQuartzAccount(userAddress);
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

            const transaction = await buildTransaction(this.connection, ixs, userAddress, lookupTables);
            transaction.sign(signers);

            const serializedTx = Buffer.from(transaction.serialize()).toString("base64");

            res.status(200).json({ transaction: serializedTx });
            return;
        } catch (error) {
            next(error);
        }
    }

    rescue = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const paramsSchema = z.object({
                user: z.string({
                    required_error: "user is required",
                    invalid_type_error: "user must be a string"
                }).refine((str) => {
                    try {
                        new PublicKey(str);
                        return true;
                    } catch {
                        return false;
                    }
                }, {
                    message: "user is not a valid Solana public key"
                }).transform(str => new PublicKey(str)),
                mint: z.string().refine(
                    (value: string) => {
                        try {
                            new PublicKey(value);
                            return true;
                        } catch {
                            return false;
                        }
                    },
                    { message: "Mint is not a valid public key" }
                ).transform(str => new PublicKey(str)),
            });

            const {
                user: userAddress,
                mint
            } = await validateParams(paramsSchema, req);

            const quartzClient = await this.quartzClientPromise;
            let user: QuartzUser;
            try {
                user = await quartzClient.getQuartzAccount(userAddress);
            } catch {
                throw new HttpException(400, "User not found");
            }

            const {
                ixs,
                lookupTables,
                signers
            } = await user.makeRescueDepositIxs(mint);

            const transaction = await buildTransaction(
                this.connection,
                ixs,
                userAddress,
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

    send = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const paramsSchema = z.object({
                user: z.string({
                    required_error: "user is required",
                    invalid_type_error: "user must be a string"
                }).refine((str) => {
                    try {
                        new PublicKey(str);
                        return true;
                    } catch {
                        return false;
                    }
                }, {
                    message: "Sender address is not a valid Solana public key"
                }).transform(str => new PublicKey(str)),
                destination: z.string().refine(
                    (value: string) => {
                        try {
                            new PublicKey(value);
                            return true;
                        } catch {
                            return false;
                        }
                    },
                    { message: "Destination is not a valid public key" }
                ).transform(str => new PublicKey(str)),
                amountBaseUnits: z.coerce.number().refine(
                    Number.isInteger,
                    { message: "amountBaseUnits must be an integer" }
                ),
                allowLoan: z.string({
                    required_error: "allowLoan is required",
                    invalid_type_error: "allowLoan must be a string"
                })
                    .optional()
                    .default("false")
                    .transform(val => val === "true"),
                marketIndex: z.coerce.number().refine(
                    (value: number) => MarketIndex.includes(value as MarketIndex),
                    { message: "marketIndex must be a valid market index" }
                ).transform(val => val as MarketIndex),
                useMaxAmount: z.string({
                    required_error: "useMaxAmount is required",
                    invalid_type_error: "useMaxAmount must be a string"
                })
                    .optional()
                    .default("false")
                    .transform(val => val === "true"),
            });

            const {
                user: userAddress,
                destination,
                allowLoan,
                marketIndex,
                useMaxAmount
            } = await validateParams(paramsSchema, req);

            let { amountBaseUnits } = await validateParams(paramsSchema, req);

            const quartzClient = await this.quartzClientPromise;
            let user: QuartzUser;
            try {
                user = await quartzClient.getQuartzAccount(userAddress);
            } catch {
                throw new HttpException(400, "User not found");
            }

            if (useMaxAmount) {
                const amountBaseUnitsBN = await user.getWithdrawalLimit(marketIndex, !allowLoan);
                amountBaseUnits = amountBaseUnitsBN.toNumber();
            }

            const rentPayerBalance = await this.connection.getBalance(getTimeLockRentPayerPublicKey());
            const isUserPaying = rentPayerBalance < MIN_TIME_LOCK_RENT_PAYER_BALANCE;

            // Create ATA for destination if needed (wSOL is already unwrapped)
            let oix_createAta: TransactionInstruction[] = [];
            const mint = TOKENS[marketIndex].mint;
            if (mint !== TOKENS[MARKET_INDEX_SOL].mint) {
                const mintTokenProgram = await getTokenProgram(this.connection, mint);
                const ata = getAssociatedTokenAddressSync(mint, destination, true, mintTokenProgram);
                oix_createAta = await makeCreateAtaIxIfNeeded(
                    this.connection,
                    ata,
                    destination,
                    mint,
                    mintTokenProgram,
                    userAddress
                );
            }

            const reduceOnly = !allowLoan;
            const {
                ixs,
                lookupTables,
                signers
            } = await user.makeInitiateWithdrawIxs(
                amountBaseUnits,
                marketIndex,
                reduceOnly,
                isUserPaying,
                destination
            );

            const transaction = await buildTransaction(
                this.connection,
                [...oix_createAta, ...ixs],
                userAddress,
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
}