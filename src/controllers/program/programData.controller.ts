import type { NextFunction, Request, Response } from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import { HttpException } from '../../utils/errors.js';
import { AccountStatus } from '../../types/enums/AccountStatus.enum.js';
import { Controller } from '../../types/controller.class.js';
import config from '../../config/config.js';
import { QuartzClient } from '@quartz-labs/sdk';
import { checkHasVaultHistory, checkIsMissingBetaKey, checkIsVaultInitialized, checkRequiresUpgrade } from './program-data/accountStatus.js';

export class ProgramDataController extends Controller {
    private connection: Connection;
    private quartzClientPromise: Promise<QuartzClient>;

    constructor() {
        super();
        this.connection = new Connection(config.RPC_URL);
        this.quartzClientPromise = QuartzClient.fetchClient(this.connection);
    }

    public getAccountStatus = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const address = req.query.wallet as string;
            if (!address) {
                throw new HttpException(400, "Wallet address is required");
            }

            let pubkey;
            try {
                pubkey = new PublicKey(address);
            } catch {
                throw new HttpException(400, "Invalid wallet address");
            }

            const [hasVaultHistory, isMissingBetaKey, isVaultInitialized, requiresUpgrade] = await Promise.all([
                checkHasVaultHistory(pubkey, this.connection),
                checkIsMissingBetaKey(pubkey, this.connection),
                checkIsVaultInitialized(pubkey, this.connection),
                checkRequiresUpgrade(pubkey, this.connection)
            ]);
            
            if (!isVaultInitialized && hasVaultHistory) {
                res.status(200).json({ status: AccountStatus.CLOSED });
                return;
            } else if (isMissingBetaKey) {
                res.status(200).json({ status: AccountStatus.NO_BETA_KEY });
                return;
            } else if (isVaultInitialized) {
                if (requiresUpgrade) {
                    res.status(200).json({ status: AccountStatus.UPGRADE_REQUIRED });
                    return;
                } else {
                    res.status(200).json({ status: AccountStatus.INITIALIZED });
                    return;
                }
            } else {
                res.status(200).json({ status: AccountStatus.NOT_INITIALIZED });
                return;
            }
        } catch (error) {
            next(error);
        }
    }
}