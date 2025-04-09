import config from "../config/config.js";
import type { NextFunction, Request, Response } from "express";
import { bnToDecimal } from "../utils/helpers.js";
import { Connection, PublicKey } from "@solana/web3.js";
import { HttpException } from "../utils/errors.js";
import { QuartzClient, type QuartzUser, type BN, MarketIndex, retryWithBackoff } from "@quartz-labs/sdk";
import { Controller } from "../types/controller.class.js";
import type { SpendLimitsOrderAccountResponse, WithdrawOrderAccountResponse } from "../types/orders.interface.js";

export class UserController extends Controller{
    private quartzClientPromise: Promise<QuartzClient>;
    private connection: Connection;
    private rateCache: Record<string, { depositRate: number; borrowRate: number; timestamp: number }> = {};
    private RATE_CACHE_DURATION = 60_000;

    constructor() {
        super();
        this.connection = new Connection(config.RPC_URL);
        this.quartzClientPromise = QuartzClient.fetchClient(this.connection);
    }

    private validateAddress(address: string): PublicKey {
        try {
            const pubkey = new PublicKey(address);
            return pubkey;
        } catch {
            throw new HttpException(400, "Invalid address");
        }
    }

    private async getQuartzUser(pubkey: PublicKey): Promise<QuartzUser> {
        try {
            const quartzClient = await this.quartzClientPromise || QuartzClient.fetchClient(this.connection);    
            return await retryWithBackoff(
                () => quartzClient.getQuartzAccount(pubkey),
                2
            )
        } catch {
            throw new HttpException(400, "Quartz account not found");
        }
    }

    private validateMarketIndices(marketIndicesParam: string) {
        if (!marketIndicesParam) {
            throw new HttpException(400, "Market indices are required");
        }

        const decodedMarketIndices = decodeURIComponent(marketIndicesParam);
        const marketIndices = decodedMarketIndices.split(',').map(Number).filter(n => !Number.isNaN(n));
        if (marketIndices.length === 0) {
            throw new HttpException(400, "Invalid market index");
        }

        if (marketIndices.some(index => !MarketIndex.includes(index as any))) {
            throw new HttpException(400, "Unsupported market index");
        }

        return marketIndices as MarketIndex[];
    }

    public getRate = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const quartzClient = await this.quartzClientPromise || QuartzClient.fetchClient(this.connection);    

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
                
                    // Update cache
                    this.rateCache[index] = {
                        depositRate: bnToDecimal(depositRateBN, 6),
                        borrowRate: bnToDecimal(borrowRateBN, 6),
                        timestamp: now
                    };
                });
    
                await Promise.all(promises);
            }

            const rates = marketIndices.reduce((acc, index) =>
                Object.assign(acc, {
                    [index]: {
                        depositRate: this.rateCache[index]?.depositRate,
                        borrowRate: this.rateCache[index]?.borrowRate
                    }
                }
            ), {} as Record<
                MarketIndex, 
                { depositRate: number | undefined; borrowRate: number | undefined }>
            );

            res.status(200).json(rates);
        } catch (error) {
            next(error);
        }
    }

    public getBalance = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const marketIndices = this.validateMarketIndices(req.query.marketIndices as string);
            const address = this.validateAddress(req.query.address as string);
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
            const address = this.validateAddress(req.query.address as string);
            const user = await this.getQuartzUser(address);

            const withdrawLimits = await retryWithBackoff(
                () => user.getMultipleWithdrawalLimits(marketIndices, true),
                3
            );

            res.status(200).json(withdrawLimits);
        } catch (error) {
            next(error);
        }
    }

    public getBorrowLimit = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const marketIndices = this.validateMarketIndices(req.query.marketIndices as string);
            const address = this.validateAddress(req.query.address as string);
            const user = await this.getQuartzUser(address);

            const borrowLimits = await retryWithBackoff(
                () => user.getMultipleWithdrawalLimits(marketIndices, false),
                3
            );

            res.status(200).json(borrowLimits);
        } catch (error) {
            next(error);
        }
    }

    public getHealth = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const address = this.validateAddress(req.query.address as string);
            const user = await this.getQuartzUser(address);
            const health = user.getHealth();
            res.status(200).json(health);
        } catch (error) {
            next(error);
        }
    }

    public getSpendableBalance = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const address = this.validateAddress(req.query.address as string);
            const user = await this.getQuartzUser(address);
            const getAvailableCreditUsdcBaseUnits = await user
                .getAvailableCreditUsdcBaseUnits();

            res.status(200).json(getAvailableCreditUsdcBaseUnits);
        } catch (error) {
            next(error);
        }
    }

    public getOpenOrders = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const address = this.validateAddress(req.query.address as string);
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

            // Convert BNs to numbers
            const withdrawOrdersNumber = withdrawOrders.map(order => ({
                publicKey: order.publicKey.toBase58(),
                account: {
                    timeLock: {
                        owner: order.account.timeLock.owner.toBase58(),
                        isOwnerPayer: order.account.timeLock.isOwnerPayer,
                        releaseSlot: order.account.timeLock.releaseSlot.toNumber()
                    },
                    amountBaseUnits: order.account.amountBaseUnits.toNumber(),
                    driftMarketIndex: order.account.driftMarketIndex.toNumber(),
                    reduceOnly: order.account.reduceOnly
                }
            })) as WithdrawOrderAccountResponse[];

            const spendLimitOrdersNumber = spendLimitOrders.map(order => ({
                publicKey: order.publicKey.toBase58(),
                account: {
                    timeLock: {
                        owner: order.account.timeLock.owner.toBase58(),
                        isOwnerPayer: order.account.timeLock.isOwnerPayer,
                        releaseSlot: order.account.timeLock.releaseSlot.toNumber()
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
