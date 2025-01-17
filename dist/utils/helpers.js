import config from "../config/config.js";
import { TOKENS } from "@quartz-labs/sdk";
import { VersionedTransaction } from "@solana/web3.js";
import { ComputeBudgetProgram } from "@solana/web3.js";
import { TransactionMessage } from "@solana/web3.js";
import { createAssociatedTokenAccountInstruction } from "@solana/spl-token";
export function bnToDecimal(bn, decimalPlaces) {
    const decimalFactor = 10 ** decimalPlaces;
    return bn.toNumber() / decimalFactor;
}
export const retryRPCWithBackoff = async (fn, retries, initialDelay, logger) => {
    let lastError;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            if (error?.message?.includes('503')) {
                const delay = initialDelay * (2 ** i);
                if (logger)
                    logger.warn(`RPC node unavailable, retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw error;
        }
    }
    throw lastError;
};
export const getGoogleAccessToken = async () => {
    const jwtToken = JSON.stringify({
        iss: config.GOOGLE_CLIENT_EMAIL,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000)
    });
    const signedJwt = await signJwt(jwtToken, config.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"));
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: signedJwt,
        }),
    });
    const data = (await response.json());
    return data.access_token;
};
const signJwt = async (token, privateKey) => {
    const encoder = new TextEncoder();
    const header = { alg: 'RS256', typ: 'JWT' };
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(token).toString('base64url');
    const signInput = `${encodedHeader}.${encodedPayload}`;
    const pemContents = privateKey
        .replace(/-----BEGIN PRIVATE KEY-----/, '')
        .replace(/-----END PRIVATE KEY-----/, '')
        .replace(/\n/g, '');
    const pemArrayBuffer = new Uint8Array(Buffer.from(pemContents, 'base64')).buffer;
    const key = await crypto.subtle.importKey('pkcs8', pemArrayBuffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(signInput));
    const encodedSignature = Buffer.from(signature).toString('base64url');
    return `${signInput}.${encodedSignature}`;
};
export const getTimestamp = () => {
    const date = new Date();
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
};
export async function buildTransaction(connection, instructions, address, lookupTables = []) {
    // TODO: Calculate actual compute unit and fee
    const ix_computeLimit = ComputeBudgetProgram.setComputeUnitLimit({
        units: 200_000,
    });
    const ix_computePrice = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 1_250_000,
    });
    instructions.unshift(ix_computeLimit, ix_computePrice);
    const blockhash = (await connection.getLatestBlockhash()).blockhash;
    const messageV0 = new TransactionMessage({
        payerKey: address,
        recentBlockhash: blockhash,
        instructions: instructions
    }).compileToV0Message(lookupTables);
    const transaction = new VersionedTransaction(messageV0);
    return transaction;
}
export async function makeCreateAtaIxsIfNeeded(connection, ata, authority, mint) {
    const oix_createAta = [];
    const ataInfo = await connection.getAccountInfo(ata);
    if (ataInfo === null) {
        oix_createAta.push(createAssociatedTokenAccountInstruction(authority, ata, authority, mint));
    }
    return oix_createAta;
}
export function getWsolMint() {
    const mint = Object.values(TOKENS).find(token => token.name === "SOL")?.mint;
    if (!mint)
        throw new Error("wSolMint not found");
    return mint;
}
export async function getJupiterSwapQuote(inputMint, outputMint, amount, slippageBps) {
    const quoteEndpoint = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint.toBase58()}&outputMint=${outputMint.toBase58()}&amount=${amount}&slippageBps=${slippageBps}&swapMode=ExactOut&onlyDirectRoutes=true`;
    const response = await fetch(quoteEndpoint);
    const body = await response.json();
    if (!response.ok)
        throw new Error(JSON.stringify(body.error) ?? `Could not fetch ${quoteEndpoint}`);
    return body;
}
export async function getTokenAccountBalance(connection, tokenAccount) {
    try {
        const balance = await connection.getTokenAccountBalance(tokenAccount);
        return Number(balance.value.amount);
    }
    catch {
        return 0;
    }
}
export function baseUnitToDecimal(baseUnits, marketIndex) {
    const token = TOKENS[marketIndex];
    return baseUnits / (10 ** token.decimalPrecision.toNumber());
}
//# sourceMappingURL=helpers.js.map