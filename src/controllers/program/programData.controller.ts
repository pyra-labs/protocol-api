import type { NextFunction, Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import { HttpException } from '../../utils/errors.js';
import { AccountStatus } from '../../types/enums/AccountStatus.enum.js';
import { Controller } from '../../types/controller.class.js';
import config from '../../config/config.js';
import { QuartzClient } from '@quartz-labs/sdk';
import { checkHasVaultHistory, checkIsVaultInitialized, checkRequiresUpgrade } from './program-data/accountStatus.js';
import { getSpendLimits } from './program-data/spendLimits.js';
import AdvancedConnection from '@quartz-labs/connection';

export class ProgramDataController extends Controller {
    private connection: AdvancedConnection;
    private quartzClientPromise: Promise<QuartzClient>;

    constructor() {
        super();
        this.connection = new AdvancedConnection(config.RPC_URLS);
        this.quartzClientPromise = QuartzClient.fetchClient({connection: this.connection});
    }

    public getAccountStatus = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const address = req.query.wallet as string;
            if (!address) {
                throw new HttpException(400, "Wallet address is required");
            }

            let pubkey: PublicKey;
            try {
                pubkey = new PublicKey(address);
            } catch {
                throw new HttpException(400, "Invalid wallet address");
            }

            const [hasVaultHistory, isVaultInitialized, requiresUpgrade] = await Promise.all([
                checkHasVaultHistory(pubkey, this.connection),
                checkIsVaultInitialized(pubkey, this.connection),
                checkRequiresUpgrade(pubkey, this.connection)
            ]);
            
            if (!isVaultInitialized && hasVaultHistory) {
                res.status(200).json({ status: AccountStatus.CLOSED });
                return;
            } 
            
            if (isVaultInitialized) {
                if (requiresUpgrade) {
                    res.status(200).json({ status: AccountStatus.UPGRADE_REQUIRED });
                    return;
                }
                
                res.status(200).json({ status: AccountStatus.INITIALIZED });
                return;
            } 

            res.status(200).json({ status: AccountStatus.NOT_INITIALIZED });
        } catch (error) {
            next(error);
        }
    }

    public getSpendLimits = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const address = new PublicKey(req.query.address as string);
            if (!address) {
                throw new HttpException(400, "Wallet address is required");
            }

            const quartzClient = await this.quartzClientPromise;    
            const spendLimits = await getSpendLimits(address, this.connection, quartzClient);

            res.status(200).json(spendLimits);
            return;
        } catch (error) {
            next(error);
        }
    }
}