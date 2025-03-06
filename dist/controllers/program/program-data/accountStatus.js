import { getVaultPublicKey, retryWithBackoff } from '@quartz-labs/sdk';
import { Connection, PublicKey } from '@solana/web3.js';
import config from '../../../config/config.js';
import { HttpException } from '../../../utils/errors.js';
export const checkHasVaultHistory = async (wallet, connection) => {
    const vaultPda = getVaultPublicKey(wallet);
    const signatures = await retryWithBackoff(async () => connection.getSignaturesForAddress(vaultPda), 4);
    const isSignatureHistory = (signatures.length > 0);
    return isSignatureHistory;
};
export const checkIsMissingBetaKey = async (address, connection) => {
    if (!config.REQUIRE_BETA_KEY)
        return false;
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
    if (!response.ok)
        throw new HttpException(500, JSON.stringify(body));
    const typedBody = body;
    for (const asset of typedBody.result.items) {
        if (asset.content.metadata.name && asset.content.metadata.name.includes("Quartz Pin")) {
            return false;
        }
    }
    return true;
};
export const checkIsVaultInitialized = async (wallet, connection) => {
    const vaultPda = getVaultPublicKey(wallet);
    const vaultPdaAccount = await retryWithBackoff(async () => connection.getAccountInfo(vaultPda), 2);
    return (vaultPdaAccount !== null);
};
export const checkRequiresUpgrade = async (wallet, connection) => {
    const vaultPda = getVaultPublicKey(wallet);
    const vaultPdaAccount = await retryWithBackoff(async () => connection.getAccountInfo(vaultPda), 2);
    if (vaultPdaAccount === null)
        return false;
    const OLD_VAULT_SIZE = 41;
    return (vaultPdaAccount.data.length <= OLD_VAULT_SIZE);
};
//# sourceMappingURL=accountStatus.js.map