import type { NextFunction, Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import { HttpException } from '../../utils/errors.js';
import { AccountStatus } from '../../types/enums/AccountStatus.enum.js';
import { Controller } from '../../types/controller.class.js';
import config from '../../config/config.js';
import { BN, getMarketIndicesRecord, getTokenAccountBalance, getTokenProgram, MARKET_INDEX_SOL, MarketIndex, QuartzClient, type QuartzUser, TOKENS } from '@quartz-labs/sdk';
import { getRemainingTimeframeLimit } from './program-data/spendLimits.js';
import AdvancedConnection from '@quartz-labs/connection';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { z } from 'zod';
import { validateParams } from '../../utils/helpers.js';
import { checkHasVaultHistory, checkIsVaultInitialized, checkRequiresUpgrade } from './program-data/accountStatus.js';

export class ProgramDataController extends Controller {
    private connection: AdvancedConnection;
    private quartzClientPromise: Promise<QuartzClient>;

    constructor() {
        super();
        this.connection = new AdvancedConnection(config.RPC_URLS);
        this.quartzClientPromise = QuartzClient.fetchClient({ connection: this.connection });
    }

    public getAccountStatus = async (req: Request, res: Response, next: NextFunction) => {
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
                    message: "Wallet address is not a valid Solana public key"
                }).transform(str => new PublicKey(str))
            });

            const { user } = await validateParams(paramsSchema, req);

            const [hasVaultHistory, isVaultInitialized, requiresUpgrade] = await Promise.all([
                checkHasVaultHistory(this.connection, user),
                checkIsVaultInitialized(this.connection, user),
                checkRequiresUpgrade(this.connection, user)
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
                    message: "Wallet address is not a valid Solana public key"
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

            const currentSlot = await this.connection.getSlot();

            const spendLimitTImeframeRemaining = getRemainingTimeframeLimit(user, new BN(currentSlot));

            res.status(200).json({
                timeframe: user.timeframeInSeconds.toNumber(),
                spendLimitTransactionBaseUnits: user.spendLimitPerTransaction.toNumber(),
                spendLimitTimeframeBaseUnits: user.spendLimitPerTimeframe.toNumber(),
                spendLimitTimeframeRemainingBaseUnits: spendLimitTImeframeRemaining.toNumber()
            });
            return;
        } catch (error) {
            next(error);
        }
    }


    public getWalletBalance = async (req: Request, res: Response, next: NextFunction) => {
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
                })
                    .refine(async (key) => {
                        return await QuartzClient.doesQuartzUserExist(
                            this.connection,
                            new PublicKey(key)
                        );
                    }, {
                        message: "Quartz user does not exist"
                    })
                    .transform((key) => new PublicKey(key))
            });

            const { user: userAddress } = await validateParams(paramsSchema, req);

            const balances = getMarketIndicesRecord<number>(0);
            for (const marketIndex of MarketIndex) {
                if (marketIndex === MARKET_INDEX_SOL) {
                    const wallet_rent = await this.connection.getMinimumBalanceForRentExemption(0);
                    const balance = await this.connection.getBalance(userAddress);
                    const availableBalance = balance - wallet_rent;
                    balances[marketIndex] = Math.max(availableBalance, 0);
                    continue;
                }

                const mint = TOKENS[marketIndex].mint;
                const tokenProgram = await getTokenProgram(this.connection, mint);
                const ata = getAssociatedTokenAddressSync(mint, userAddress, true, tokenProgram);
                balances[marketIndex] = await getTokenAccountBalance(this.connection, ata);
            }

            res.status(200).json(balances);
            return;
        } catch (error) {
            next(error);
        }
    }

    public currentSlot = async (_: Request, res: Response, next: NextFunction) => {
        try {
            const currentSlot = await this.connection.getSlot();

            res.status(200).json(currentSlot);
            return;
        } catch (error) {
            next(error);
        }
    }
}
