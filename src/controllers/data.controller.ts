import { NextFunction, Request, Response } from "express";
import { HttpException } from "../utils/errors.js";
import { AnchorProvider, Idl, Program, setProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import config from "../config/config.js";
import quartzIdl from "../idl/quartz.json" with { type: "json" };
import { Quartz } from "../types/quartz.js";
import { QUARTZ_PROGRAM_ID } from "../config/constants.js";
import { retryRPCWithBackoff } from "../utils/helpers.js";
import { DriftUser } from "../model/driftUser.js";
import { DriftClient } from "@drift-labs/sdk";

export class DataController {
    private priceCache: Record<string, { price: number; timestamp: number }> = {};
    private PRICE_CACHE_DURATION = 60_000;

    private connection: Connection;
    private program: Program<Quartz>;
    private driftClient: DriftClient;
    private driftClientInitPromise: Promise<boolean>;

    constructor() {
        this.connection = new Connection(config.RPC_URL);
        const wallet = new Wallet(Keypair.generate());

        const provider = new AnchorProvider(this.connection, wallet, { commitment: "confirmed" });
        setProvider(provider);
        this.program = new Program(quartzIdl as Idl, QUARTZ_PROGRAM_ID, provider) as unknown as Program<Quartz>;

        this.driftClient = new DriftClient({
            connection: this.connection,
            wallet: wallet,
            env: 'mainnet-beta',
        });
        this.driftClientInitPromise = this.driftClient.subscribe();
    }

    public getPrice = async (req: Request, res: Response, next: NextFunction) => {
        const ids = req.query.ids as string;

        if (!ids) return next(new HttpException(400, "ID is required"));
        const decodedIds = decodeURIComponent(ids);
        const idArray = decodedIds.split(",");
        
        try {
            const now = Date.now();
            const uncachedIds = idArray.filter(id => {
                const cached = this.priceCache[id];
                return !cached || (now - cached.timestamp) > this.PRICE_CACHE_DURATION;
            });

            if (uncachedIds.length > 0) {
                const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${uncachedIds.join(',')}&vs_currencies=usd`);

                if (!response.ok) {
                    return next(new HttpException(400, "Failed to fetch data from CoinGecko"));
                }

                const data = await response.json();

                Object.keys(data).forEach(id => {
                    this.priceCache[id] = {
                        price: data[id].usd,
                        timestamp: now
                    };
                });
            }

            const pricesUsd = idArray.reduce((acc, id) => {
                if (this.priceCache[id]) {
                    acc[id] = this.priceCache[id].price;
                }
                return acc;
            }, {} as Record<string, number>);

            if (Object.keys(pricesUsd).length === 0) {
                return next(new HttpException(400, "Invalid ID"));
            }

            res.status(200).json(pricesUsd);
        } catch (error) {
            next(error);
        }
    }

    public getUsers = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const vaults = await retryRPCWithBackoff(
                async () => {
                    return await this.program.account.vault.all();
                },
                3,
                1_000
            );

            const users = vaults.map(vault => vault.account.owner.toBase58());

            res.status(200).json({
                count: users.length,
                users: users
            });
        } catch (error) {
            next(error);
        }
    }

    public getTVL = async (req: Request, res: Response, next: NextFunction) => {
        await this.driftClientInitPromise;

        try {
            const vaults = await retryRPCWithBackoff(
                async () => this.program.account.vault.all(),
                3,
                1_000
            );

            let tvl = 0;
            for (const vault of vaults) {
                const driftUser = new DriftUser(vault.account.owner, this.connection, this.driftClient!);
                await retryRPCWithBackoff(
                    async () => driftUser.initialize(),
                    3,
                    1_000
                );
                tvl += driftUser.getTotalCollateralValue().toNumber();
            }

            res.status(200).json({
                usd: tvl
            });
        } catch (error) {
            next(error);
        }
    }
}