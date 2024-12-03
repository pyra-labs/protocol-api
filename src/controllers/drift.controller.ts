import { calculateBorrowRate, calculateDepositRate, DriftClient, Wallet } from "@drift-labs/sdk";
import { Connection, Keypair } from "@solana/web3.js";
import config from "../config/config.js";
import { NextFunction, Request, Response } from "express";
import { bnToDecimal, getQuartzHealth, retryRPCWithBackoff } from "../utils/helpers.js";
import { DriftUser } from "../model/driftUser.js";
import { PublicKey } from "@solana/web3.js";
import { HttpException } from "../utils/errors.js";
import { SUPPORTED_DRIFT_MARKET_INDICES, SUPPORTED_DRIFT_MARKETS } from "../config/constants.js";
import { DriftClientService } from "../services/driftClientService.js";

export class DriftController {
    private connection: Connection;
    private driftClientPromise: Promise<DriftClient>;

    private rateCache: Record<string, { depositRate: number; borrowRate: number; timestamp: number }> = {};
    private RATE_CACHE_DURATION = 60_000;

    constructor() {
        this.connection = new Connection(config.RPC_URL);
        this.driftClientPromise = DriftClientService.getDriftClient();
    }

    private async getUser(address: string, driftClient: DriftClient) {
        const driftUser = new DriftUser(new PublicKey(address), this.connection, driftClient);
        await retryRPCWithBackoff(
            async () => driftUser.initialize(),
            3,
            500
        );
        return driftUser;
    }

    private validateAddress(address: string) {
        try {
            new PublicKey(address);
            return address;
        } catch (error) {
            throw new HttpException(400, "Invalid address");
        }
    }

    private validateMarketIndices(marketIndicesParam: string) {
        if (!marketIndicesParam) {
            throw new HttpException(400, "Market indices are required");
        }

        const decodedMarketIndices = decodeURIComponent(marketIndicesParam);
        const marketIndices = decodedMarketIndices.split(',').map(Number).filter(n => !isNaN(n));
        if (marketIndices.length === 0) {
            throw new HttpException(400, "Invalid market indices");
        }

        if (marketIndices.some(index => !SUPPORTED_DRIFT_MARKET_INDICES.includes(index))) {
            throw new HttpException(400, "Unsupported market index");
        }

        return marketIndices;
    }

    public getRate = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const driftClient = await this.driftClientPromise;

            const marketIndices = this.validateMarketIndices(req.query.marketIndices as string);

            const now = Date.now();
            const uncachedMarketIndices = marketIndices.filter(index => {
                const cached = this.rateCache[index];
                return !cached || (now - cached.timestamp) > this.RATE_CACHE_DURATION;
            });

            if (uncachedMarketIndices.length > 0) {
                const promises = uncachedMarketIndices.map(async (index) => {
                    const spotMarket = await driftClient.getSpotMarketAccount(index);
                    if (!spotMarket) throw new HttpException(400, `Could not find spot market for index ${index}`);
                
                    const depositRateBN = calculateDepositRate(spotMarket);
                    const borrowRateBN = calculateBorrowRate(spotMarket);
                
                    // Update cache
                    this.rateCache[index] = {
                        depositRate: bnToDecimal(depositRateBN, 6),
                        borrowRate: bnToDecimal(borrowRateBN, 6),
                        timestamp: now
                    };
                });
    
                await Promise.all(promises);
            }

            const rates = marketIndices.map(index => ({
                depositRate: this.rateCache[index].depositRate,
                borrowRate: this.rateCache[index].borrowRate
            }));

            res.status(200).json(rates);
        } catch (error) {
            next(error);
        }
    }

    public getBalance = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const driftClient = await this.driftClientPromise;

            const address = this.validateAddress(req.query.address as string);
            const marketIndices = this.validateMarketIndices(req.query.marketIndices as string);

            const driftUser = await this.getUser(address, driftClient).catch(() => {
                throw new HttpException(400, "User not found");
            });

            const balances = await Promise.all(marketIndices.map(async (index) => {
                return driftUser.getTokenAmount(index).toNumber();
            }));

            res.status(200).json(balances);
        } catch (error) {
            next(error);
        }
    }

    public getWithdrawLimit = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const driftClient = await this.driftClientPromise;

            const address = this.validateAddress(req.query.address as string);
            const marketIndices = this.validateMarketIndices(req.query.marketIndices as string);

            const driftUser = await this.getUser(address, driftClient).catch(() => {
                throw new HttpException(400, "User not found");
            });

            const withdrawLimits = await Promise.all(marketIndices.map(async (index) => {
                return driftUser.getWithdrawalLimit(index, false, true).toNumber();
            }));

            res.status(200).json(withdrawLimits);
        } catch (error) {
            next(error);
        }
    }

    public getHealth = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const driftClient = await this.driftClientPromise;

            const address = this.validateAddress(req.query.address as string);

            const driftUser = await this.getUser(address, driftClient).catch(() => {
                throw new HttpException(400, "User not found");
            });

            const driftHealth = driftUser.getHealth();
            const quartzHealth = getQuartzHealth(driftHealth);

            res.status(200).json(quartzHealth);
        } catch (error) {
            next(error);
        }
    }
}