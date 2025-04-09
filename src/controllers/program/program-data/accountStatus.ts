import { getVaultPublicKey, retryWithBackoff } from '@quartz-labs/sdk';
import type { Connection, PublicKey } from '@solana/web3.js';

export const checkHasVaultHistory = async (wallet: PublicKey, connection: Connection): Promise<boolean> => {
    const vaultPda = getVaultPublicKey(wallet);
    const signatures = await retryWithBackoff(
        async () => connection.getSignaturesForAddress(vaultPda),
        4
    );
    const isSignatureHistory = (signatures.length > 0);
    return isSignatureHistory;
}

export const checkIsVaultInitialized = async (wallet: PublicKey, connection: Connection): Promise<boolean> => {
    const vaultPda = getVaultPublicKey(wallet);
    const vaultPdaAccount = await retryWithBackoff(
        async () => connection.getAccountInfo(vaultPda),
        2
    );
    return (vaultPdaAccount !== null);
}

export const checkRequiresUpgrade = async (wallet: PublicKey, connection: Connection): Promise<boolean> => {
    const vaultPda = getVaultPublicKey(wallet);
    const vaultPdaAccount = await retryWithBackoff(
        async () => connection.getAccountInfo(vaultPda),
        2
    );
    if (vaultPdaAccount === null) return false;

    const OLD_VAULT_SIZE = 41;
    return (vaultPdaAccount.data.length <= OLD_VAULT_SIZE);
}
