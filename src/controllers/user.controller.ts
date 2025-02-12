import config from "../config/config.js";
import type { NextFunction, Request, Response } from "express";
import { bnToDecimal } from "../utils/helpers.js";
import { Connection, PublicKey } from "@solana/web3.js";
import { HttpException } from "../utils/errors.js";
import { QuartzClient, type QuartzUser, type BN, MarketIndex, retryWithBackoff } from "@quartz-labs/sdk";
import { Controller } from "./controller.js";

export class UserController extends Controller{
    private quartzClientPromise: Promise<QuartzClient>;

    private rateCache: Record<string, { depositRate: number; borrowRate: number; timestamp: number }> = {};
    private RATE_CACHE_DURATION = 60_000;

    constructor() {
        super();
        const connection = new Connection(config.RPC_URL);
        this.quartzClientPromise = QuartzClient.fetchClient(connection);
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
            const quartzClient = await this.quartzClientPromise;
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

            const balances = Object.entries(balancesBN).reduce((acc, [index, balance]) =>
                Object.assign(acc, {
                    [index]: balance.toNumber()
                }),
                {} as Record<MarketIndex, number>
            );

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
                () => user.getMultipleWithdrawalLimits(marketIndices),
                3
            );

            res.status(200).json(withdrawLimits);
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
}