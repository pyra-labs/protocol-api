import { calculateBorrowRate, calculateDepositRate, DriftClient, Wallet } from "@drift-labs/sdk";
import { Connection, Keypair } from "@solana/web3.js";
import config from "../config/config";
import { NextFunction, Request, Response } from "express";
import { bnToDecimal, getQuartzHealth, retryRPCWithBackoff } from "../utils/helpers";
import { DriftUser } from "../models/driftUser";
import { PublicKey } from "@solana/web3.js";

export class DriftController {
    private connection: Connection;
    private driftClient: DriftClient;

    private initPromise: Promise<boolean>;

    constructor() {
        this.connection = new Connection(config.RPC_URL);

        const keypair = Keypair.fromSecretKey(config.DRIFT_KEYPAIR);
        const wallet = new Wallet(keypair);
        
        this.driftClient = new DriftClient({
            connection: this.connection,
            wallet: wallet,
            env: 'mainnet-beta',
        });
        this.initPromise = this.driftClient.subscribe();
    }

    private async getUser(address: string) {
        const driftUser = new DriftUser(new PublicKey(address), this.connection, this.driftClient!);
        await retryRPCWithBackoff(
            async () => driftUser.initialize(),
            3,
            500
        );
        return driftUser;
    }

    public getRate = async (req: Request, res: Response, next: NextFunction) => {
        await this.initPromise;

        const marketIndicesParam = req.query.marketIndices as string;
        const marketIndices = marketIndicesParam.split(',').map(Number).filter(n => !isNaN(n));

        const promises = marketIndices.map(async (index) => {
            const spotMarket = await this.driftClient.getSpotMarketAccount(index);
            if (!spotMarket) return next(new Error(`Could not find spot market for index ${index}`));
        
            const depositRateBN = calculateDepositRate(spotMarket);
            const borrowRateBN = calculateBorrowRate(spotMarket);
        
            return {
                depositRate: bnToDecimal(depositRateBN, 6),
                borrowRate: bnToDecimal(borrowRateBN, 6)
            };
        });

        const rates = await Promise.all(promises);
        res.status(200).json(rates);
    }

    public getBalance = async (req: Request, res: Response, next: NextFunction) => {
        await this.initPromise;

        const address = req.query.address as string;
        const marketIndicesParam = req.query.marketIndices as string;
        const marketIndices = marketIndicesParam.split(',').map(Number).filter(n => !isNaN(n));

        try {
            const driftUser = await this.getUser(address);
            const balances = await Promise.all(marketIndices.map(async (index) => {
                return driftUser.getTokenAmount(index);
            }));

            res.status(200).json(balances);
        } catch (error) {
            next(error);
        }
    }

    public getWithdrawLimit = async (req: Request, res: Response, next: NextFunction) => {
        await this.initPromise;

        const address = req.query.address as string;
        const marketIndicesParam = req.query.marketIndices as string;
        const marketIndices = marketIndicesParam.split(',').map(Number).filter(n => !isNaN(n));

        try {
            const driftUser = await this.getUser(address);
            const withdrawLimits = await Promise.all(marketIndices.map(async (index) => {
                return driftUser.getWithdrawalLimit(index, false).toNumber();
            }));
            res.status(200).json(withdrawLimits);
        } catch (error) {
            next(error);
        }
    }

    public getHealth = async (req: Request, res: Response, next: NextFunction) => {
        await this.initPromise;

        const address = req.query.address as string;

        try {
            const driftUser = await this.getUser(address);
            const driftHealth = driftUser.getHealth();
            const quartzHealth = getQuartzHealth(driftHealth);
            res.status(200).json(quartzHealth);
        } catch (error) {
            next(error);
        }
    }
}