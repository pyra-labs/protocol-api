import { getVaultPublicKey, retryWithBackoff } from '@quartz-labs/sdk';
import { PublicKey } from '@solana/web3.js';
import type { NextFunction, Request, Response } from 'express';
import config from '../../config/config.js';
import { AccountStatus } from '../../types/enums/AccountStatus.enum.js';
import { HttpException } from '../../utils/errors.js';
import { BaseProgramController } from './baseProgram.controller.js';


export class AccountStatusController extends BaseProgramController {
    constructor() {
        super();
    }

    public getAccountStatus = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const address = req.query.wallet as string;
            if (!address) {
                return next(new HttpException(400, "Wallet address is required"));
            }

            let pubkey;
            try {
                pubkey = new PublicKey(address);
            } catch {
                return next(new HttpException(400, "Invalid wallet address"));
            }

            const [hasVaultHistory, isMissingBetaKey, isVaultInitialized, requiresUpgrade] = await Promise.all([
                this.checkHasVaultHistory(pubkey),
                this.checkIsMissingBetaKey(pubkey),
                this.checkIsVaultInitialized(pubkey),
                this.checkRequiresUpgrade(pubkey)
            ]);
            
            if (!isVaultInitialized && hasVaultHistory) {
                return res.status(200).json({ status: AccountStatus.CLOSED });
            } else if (isMissingBetaKey) {
                return res.status(200).json({ status: AccountStatus.NO_BETA_KEY });
            } else if (isVaultInitialized) {
                if (requiresUpgrade) {
                    return res.status(200).json({ status: AccountStatus.UPGRADE_REQUIRED });
                } else {
                    return res.status(200).json({ status: AccountStatus.INITIALIZED });
                }
            } else {
                return res.status(200).json({ status: AccountStatus.NOT_INITIALIZED });
            }
        } catch (error) {
            next(error);
        }
    }

    private async checkHasVaultHistory(wallet: PublicKey): Promise<boolean> {
        const vaultPda = getVaultPublicKey(wallet);
        const signatures = await retryWithBackoff(
            async () => this.connection.getSignaturesForAddress(vaultPda),
            4
        );
        const isSignatureHistory = (signatures.length > 0);
        return isSignatureHistory;
    }

    private async checkIsMissingBetaKey(address: PublicKey): Promise<boolean> { 
        if (!config.REQUIRE_BETA_KEY) return false;

        const response = await fetch(this.connection.rpcEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getAssetsByOwner',
                params: {
                    ownerAddress: address.toBase58(),
                    page: 1,
                    limit: 1000
                },
            }),
        });
        
        const body = await response.json();
        if (!response.ok) throw new Error(JSON.stringify(body));

        const typedBody = body as any;
        for (const asset of typedBody.result.items) {
            if (asset.content.metadata.name && asset.content.metadata.name.includes("Quartz Pin")) {
                return false;
            }
        }

        return true;
    }

    private async checkIsVaultInitialized(wallet: PublicKey): Promise<boolean> {
        const vaultPda = getVaultPublicKey(wallet);
        const vaultPdaAccount = await retryWithBackoff(
            async () => this.connection.getAccountInfo(vaultPda),
            2
        );
        return (vaultPdaAccount !== null);
    }

    private async checkRequiresUpgrade(wallet: PublicKey): Promise<boolean> {
        const vaultPda = getVaultPublicKey(wallet);
        const vaultPdaAccount = await retryWithBackoff(
            async () => this.connection.getAccountInfo(vaultPda),
            2
        );
        if (vaultPdaAccount === null) return false;

        const OLD_VAULT_SIZE = 41;
        return (vaultPdaAccount.data.length <= OLD_VAULT_SIZE);
    }
}
