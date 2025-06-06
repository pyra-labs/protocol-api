import config from "../config/config.js";
import type { NextFunction, Request, Response } from "express";
import { bnToDecimal, getSlotTimestamp, validateParams } from "../utils/helpers.js";
import { PublicKey } from "@solana/web3.js";
import { HttpException } from "../utils/errors.js";
import { QuartzClient, type QuartzUser, type BN, MarketIndex, retryWithBackoff } from "@quartz-labs/sdk";
import { Controller } from "../types/controller.class.js";
import type { SpendLimitsOrderAccountResponse, WithdrawOrderAccountResponse } from "../types/orders.interface.js";
import AdvancedConnection from "@quartz-labs/connection";
import { z } from "zod";

export class UserController extends Controller {
    private quartzClientPromise: Promise<QuartzClient>;
    private connection: AdvancedConnection;
    private rateCache: Record<string, { depositRate: number; borrowRate: number; ltv: number; timestamp: number }> = {};
    private RATE_CACHE_DURATION = 60_000;
    
    private readonly addressSchema = z.string({
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
    }).transform(str => new PublicKey(str));

    constructor() {
        super();
        this.connection = new AdvancedConnection(config.RPC_URLS);
        this.quartzClientPromise = QuartzClient.fetchClient({ connection: this.connection });
    }

    private async getQuartzUser(pubkey: PublicKey): Promise<QuartzUser> {
        try {
            const quartzClient = await this.quartzClientPromise;
            return await retryWithBackoff(
                () => quartzClient.getQuartzAccount(pubkey),
                2
            )
        } catch {
            throw new HttpException(400, "Quartz account not found");
        }
    }

    private validateMarketIndices(marketIndicesParam: string): MarketIndex[] {
        const marketIndicesSchema = z.string({
            required_error: "Market indices are required",
            invalid_type_error: "Market indices must be a string"
        })
            .transform((str) => {
                const decoded = decodeURIComponent(str);
                return decoded.split(',').map(Number);
            })
            .refine(
                (indices) => indices.length > 0,
                "Invalid market index"
            )
            .refine(
                (indices) => indices.every(index => !Number.isNaN(index)),
                "Invalid market index format"
            )
            .refine(
                (indices) => indices.every(index => MarketIndex.includes(index as any)),
                "Unsupported market index"
            )
            .transform((indices) => indices as MarketIndex[]);

        try {
            return marketIndicesSchema.parse(marketIndicesParam);
        } catch (error) {
            if (error instanceof z.ZodError) {
                throw new HttpException(400, error.errors[0]?.message ?? "Invalid market indices");
            }
            throw error;
        }
    }

    public getRate = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const quartzClient = await this.quartzClientPromise;

            const marketIndices = this.validateMarketIndices(req.query.marketIndices as string);

            const now = Date.now();
            const uncachedMarketIndices = marketIndices.filter(index => {
                const cached = this.rateCache[index];
                return !cached || (now - cached.timestamp) > this.RATE_CACHE_DURATION;
            });

            if (uncachedMarketIndices.length > 0) {
                const promises = uncachedMarketIndices.map(async (index) => {
                    let depositRateBN: BN;
                    let borrowRateBN: BN;
                    try {
                        depositRateBN = await retryWithBackoff(
                            () => quartzClient.getDepositRate(index),
                            3
                        );
                        borrowRateBN = await retryWithBackoff(
                            () => quartzClient.getBorrowRate(index),
                            3
                        );
                    } catch {
                        throw new HttpException(400, `Could not find rates for spot market index ${index}`);
                    }

                    const ltv = await quartzClient.getCollateralWeight(index);

                    // Update cache
                    this.rateCache[index] = {
                        depositRate: bnToDecimal(depositRateBN, 6),
                        borrowRate: bnToDecimal(borrowRateBN, 6),
                        ltv: ltv,
                        timestamp: now
                    };
                });

                await Promise.all(promises);
            }

            const rates = marketIndices.reduce((acc, index) =>
                Object.assign(acc, {
                    [index]: {
                        depositRate: this.rateCache[index]?.depositRate,
                        borrowRate: this.rateCache[index]?.borrowRate,
                        ltv: this.rateCache[index]?.ltv
                    }
                }
                ), {} as Record<
                    MarketIndex,
                    {
                        depositRate: number | undefined;
                        borrowRate: number | undefined;
                        ltv: number | undefined
                    }>
            );

            res.status(200).json(rates);
        } catch (error) {
            next(error);
        }
    }

    public getBalance = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const marketIndices = this.validateMarketIndices(req.query.marketIndices as string);

            const paramsSchema = z.object({
                address: this.addressSchema
            });

            const { address } = await validateParams(paramsSchema, req);

            const user = await this.getQuartzUser(address);

            const balancesBN = await retryWithBackoff(
                () => user.getMultipleTokenBalances(marketIndices),
                3
            );

            const balances = Object.entries(balancesBN).reduce((acc, [index, balance]) => {
                return Object.assign(acc, {
                    [index]: balance.toNumber()
                });
            }, {} as Record<MarketIndex, number>);

            res.status(200).json(balances);
        } catch (error) {
            next(error);
        }
    }

    public getWithdrawLimit = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const marketIndices = this.validateMarketIndices(req.query.marketIndices as string);

            const paramsSchema = z.object({
                address: this.addressSchema
            });

            const { address } = await validateParams(paramsSchema, req);

            const user = await this.getQuartzUser(address);

            const withdrawLimitsBN = await retryWithBackoff(
                () => user.getMultipleWithdrawalLimits(marketIndices, true),
                3
            );

            const withdrawLimits = Object.entries(withdrawLimitsBN).reduce((acc, [index, limit]) => {
                return Object.assign(acc, {
                    [index]: limit.toNumber()
                });
            }, {} as Record<MarketIndex, number>);

            res.status(200).json(withdrawLimits);
        } catch (error) {
            next(error);
        }
    }

    public getBorrowLimit = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const marketIndices = this.validateMarketIndices(req.query.marketIndices as string);

            const paramsSchema = z.object({
                address: this.addressSchema
            });

            const { address } = await validateParams(paramsSchema, req);

            const user = await this.getQuartzUser(address);

            const borrowLimitsBN = await retryWithBackoff(
                () => user.getMultipleWithdrawalLimits(marketIndices, false),
                3
            );

            const borrowLimits = Object.entries(borrowLimitsBN).reduce((acc, [index, limit]) => {
                return Object.assign(acc, {
                    [index]: limit.toNumber()
                });
            }, {} as Record<MarketIndex, number>);

            res.status(200).json(borrowLimits);
        } catch (error) {
            next(error);
        }
    }

    public getHealth = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const paramsSchema = z.object({
                address: this.addressSchema
            });

            const { address } = await validateParams(paramsSchema, req);
            const user = await this.getQuartzUser(address);
            const health = user.getHealth();
            res.status(200).json(health);
        } catch (error) {
            next(error);
        }
    }

    public getSpendableBalance = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const paramsSchema = z.object({
                address: this.addressSchema
            });

            const { address } = await validateParams(paramsSchema, req);

            const user = await this.getQuartzUser(address);
            const getAvailableCreditUsdcBaseUnits = await user
                .getAvailableCreditUsdcBaseUnits();

            res.status(200).json(getAvailableCreditUsdcBaseUnits.toNumber());
        } catch (error) {
            next(error);
        }
    }

    public getOpenOrders = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const paramsSchema = z.object({
                address: this.addressSchema
            });

            const { address } = await validateParams(paramsSchema, req);

            try {
                await this.getQuartzUser(address);
            } catch {
                throw new HttpException(400, "Quartz account not found");
            }

            const quartzClient = await this.quartzClientPromise;
            const [
                withdrawOrders,
                spendLimitOrders
            ] = await Promise.all([
                quartzClient.getOpenWithdrawOrders(address),
                quartzClient.getOpenSpendLimitsOrders(address)
            ]);

            const currentSlot = await this.connection.getSlot();
            const now = Date.now();

            // Convert BNs to numbers
            const withdrawOrdersNumber = withdrawOrders.map(order => ({
                publicKey: order.publicKey.toBase58(),
                account: {
                    timeLock: {
                        owner: order.account.timeLock.owner.toBase58(),
                        isOwnerPayer: order.account.timeLock.isOwnerPayer,
                        releaseSlot: order.account.timeLock.releaseSlot.toNumber(),
                        releaseTimestamp: getSlotTimestamp(
                            order.account.timeLock.releaseSlot.toNumber(),
                            currentSlot,
                            now
                        )
                    },
                    amountBaseUnits: order.account.amountBaseUnits.toNumber(),
                    driftMarketIndex: order.account.driftMarketIndex.toNumber(),
                    reduceOnly: order.account.reduceOnly,
                    destination: order.account.destination.toBase58()
                }
            })) as WithdrawOrderAccountResponse[];

            const spendLimitOrdersNumber = spendLimitOrders.map(order => ({
                publicKey: order.publicKey.toBase58(),
                account: {
                    timeLock: {
                        owner: order.account.timeLock.owner.toBase58(),
                        isOwnerPayer: order.account.timeLock.isOwnerPayer,
                        releaseSlot: order.account.timeLock.releaseSlot.toNumber(),
                        releaseTimestamp: getSlotTimestamp(
                            order.account.timeLock.releaseSlot.toNumber(),
                            currentSlot,
                            now
                        )
                    },
                    spendLimitPerTransaction: order.account.spendLimitPerTransaction.toNumber(),
                    spendLimitPerTimeframe: order.account.spendLimitPerTimeframe.toNumber(),
                    timeframeInSeconds: order.account.timeframeInSeconds.toNumber(),
                    nextTimeframeResetTimestamp: order.account.nextTimeframeResetTimestamp.toNumber()
                }
            })) as SpendLimitsOrderAccountResponse[];

            res.status(200).json({
                withdrawOrders: withdrawOrdersNumber,
                spendLimitOrders: spendLimitOrdersNumber
            });
        } catch (error) {
            next(error);
        }
    }
}
