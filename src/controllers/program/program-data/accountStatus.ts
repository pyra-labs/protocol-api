import type AdvancedConnection from '@quartz-labs/connection';
import { getVaultPublicKey, retryWithBackoff } from '@quartz-labs/sdk';
import type { PublicKey } from '@solana/web3.js';

export async function checkHasVaultHistory(connection: AdvancedConnection, wallet: PublicKey): Promise<boolean> {
    const vaultPda = getVaultPublicKey(wallet);
    const signatures = await retryWithBackoff(
        async () => connection.getSignaturesForAddress(vaultPda),
        4
    );
    const isSignatureHistory = (signatures.length > 0);
    return isSignatureHistory;
}


export async function checkIsVaultInitialized(connection: AdvancedConnection, wallet: PublicKey): Promise<boolean> {
    const vaultPda = getVaultPublicKey(wallet);
    const vaultPdaAccount = await retryWithBackoff(
        async () => connection.getAccountInfo(vaultPda),
        5
    );
    return (vaultPdaAccount !== null);
}

export async function checkRequiresUpgrade(connection: AdvancedConnection, wallet: PublicKey): Promise<boolean> {
    const vaultPda = getVaultPublicKey(wallet);
    const vaultPdaAccount = await retryWithBackoff(
        async () => connection.getAccountInfo(vaultPda)
    );
    if (vaultPdaAccount === null) return false;

    const OLD_VAULT_SIZE = 41;
    return (vaultPdaAccount.data.length <= OLD_VAULT_SIZE);
}
