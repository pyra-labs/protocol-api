import { DriftClient, Wallet } from "@drift-labs/sdk";
import { Connection, Keypair } from "@solana/web3.js";
import config from "../config/config";
import { NextFunction, Request, Response } from "express";

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

    public getRate = async (req: Request, res: Response, next: NextFunction) => {
        await this.initPromise;


    }

    public getBalance = async (req: Request, res: Response, next: NextFunction) => {
        await this.initPromise;

        
    }

    public getWithdrawLimit = async (req: Request, res: Response, next: NextFunction) => {
        await this.initPromise;

        
    }

    public getHealth = async (req: Request, res: Response, next: NextFunction) => {
        await this.initPromise;

        
    }
}