import { getVaultPublicKey, retryWithBackoff } from '@quartz-labs/sdk';
import { PublicKey } from '@solana/web3.js';
import type { NextFunction, Request, Response } from 'express';
import config from '../../config/config.js';
import { AccountStatus } from '../../types/enums/AccountStatus.enum.js';
import { HttpException } from '../../utils/errors.js';
import { Controller } from '../../types/controller.class.js';
import { connection } from '../../index.js';


export class AccountStatusController extends Controller {
    constructor() {
        super();
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
                this.checkHasVaultHistory(pubkey),
                this.checkIsMissingBetaKey(pubkey),
                this.checkIsVaultInitialized(pubkey),
                this.checkRequiresUpgrade(pubkey)
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

    private async checkHasVaultHistory(wallet: PublicKey): Promise<boolean> {
        const vaultPda = getVaultPublicKey(wallet);
        const signatures = await retryWithBackoff(
            async () => connection.getSignaturesForAddress(vaultPda),
            4
        );
        const isSignatureHistory = (signatures.length > 0);
        return isSignatureHistory;
    }

    private async checkIsMissingBetaKey(address: PublicKey): Promise<boolean> { 
        if (!config.REQUIRE_BETA_KEY) return false;

        const response = await fetch(connection.rpcEndpoint, {
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
            async () => connection.getAccountInfo(vaultPda),
            2
        );
        return (vaultPdaAccount !== null);
    }

    private async checkRequiresUpgrade(wallet: PublicKey): Promise<boolean> {
        const vaultPda = getVaultPublicKey(wallet);
        const vaultPdaAccount = await retryWithBackoff(
            async () => connection.getAccountInfo(vaultPda),
            2
        );
        if (vaultPdaAccount === null) return false;

        const OLD_VAULT_SIZE = 41;
        return (vaultPdaAccount.data.length <= OLD_VAULT_SIZE);
    }
}
