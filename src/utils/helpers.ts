import config from "../config/config.js";
import { type MarketIndex, TOKENS, type BN, retryWithBackoff } from "@quartz-labs/sdk";
import { VersionedTransaction } from "@solana/web3.js";
import type { Connection } from "@solana/web3.js";
import type { TransactionInstruction } from "@solana/web3.js";
import type { PublicKey } from "@solana/web3.js";
import type { AddressLookupTableAccount } from "@solana/web3.js";
import { ComputeBudgetProgram } from "@solana/web3.js";
import { TransactionMessage } from "@solana/web3.js";
import { createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import crypto from "crypto";

export function bnToDecimal(bn: BN, decimalPlaces: number): number {
    const decimalFactor = 10 ** decimalPlaces;
    return bn.toNumber() / decimalFactor;
}

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

    const data = (await response.json()) as { access_token: string };
    return data.access_token;
}

const signJwt = async (token: string, privateKey: string): Promise<string> => {
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

    const key = await crypto.subtle.importKey(
        'pkcs8',
        pemArrayBuffer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        key,
        encoder.encode(signInput)
    );

    const encodedSignature = Buffer.from(signature).toString('base64url');
    return `${signInput}.${encodedSignature}`;
}

export const getTimestamp = () => {
    const date = new Date();
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

export async function buildTransaction(
    connection: Connection,
    instructions: TransactionInstruction[], 
    address: PublicKey,
    lookupTables: AddressLookupTableAccount[] = []
): Promise<VersionedTransaction> {
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

export async function makeCreateAtaIxsIfNeeded(
    connection: Connection,
    ata: PublicKey,
    authority: PublicKey,
    mint: PublicKey
) {
    const oix_createAta: TransactionInstruction[] = [];
    const ataInfo = await connection.getAccountInfo(ata);
    if (ataInfo === null) {
        oix_createAta.push(
            createAssociatedTokenAccountInstruction(
                authority,
                ata,
                authority,
                mint,
            )
        );
    }
    return oix_createAta;
}

export function getWsolMint() {
    const mint = Object.values(TOKENS).find(token => token.name === "SOL")?.mint;
    if (!mint) throw new Error("wSolMint not found");
    return mint;
}

export async function getJupiterSwapQuote(
    inputMint: PublicKey, 
    outputMint: PublicKey, 
    amount: number,
    slippageBps: number
) {
    const quoteEndpoint = 
        `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint.toBase58()}&outputMint=${outputMint.toBase58()}&amount=${amount}&slippageBps=${slippageBps}&swapMode=ExactOut&onlyDirectRoutes=true`;
    const response = await fetch(quoteEndpoint);
    const body: any = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(body.error) ?? `Could not fetch ${quoteEndpoint}`);
    return body;
}

export async function getTokenAccountBalance(connection: Connection, tokenAccount: PublicKey) {
    try {
        const balance = await connection.getTokenAccountBalance(tokenAccount);
        return Number(balance.value.amount);
    } catch {
        return 0;
    }
}

export function baseUnitToDecimal(baseUnits: number, marketIndex: MarketIndex): number {
    const token = TOKENS[marketIndex];
    return baseUnits / (10 ** token.decimalPrecision.toNumber());
}

export async function fetchAndParse(url: string, req?: RequestInit | undefined, retries: number = 0): Promise<any> {
    const response = await retryWithBackoff(
        async () => fetch(url, req),
        retries
    );
    
    if (!response.ok) {
        let body;
        try {
            body = await response.json();
        } catch {
            body = null;
        }
        const error = {
            status: response.status,
            body
        }
        throw new Error(JSON.stringify(error) ?? `Could not fetch ${url}`);
    }

    try {
        const body = await response.json();
        return body;
    } catch {
        return response;
    }
}

export async function generateSessionId(pem: string) {
    if (!pem) throw new Error("pem is required");

    const secretKey = crypto.randomUUID().replace(/-/g, "");
    const secretKeyBase64 = Buffer.from(secretKey, "hex").toString("base64");
    const secretKeyBase64Buffer = Buffer.from(secretKeyBase64, "utf-8");
    const secretKeyBase64BufferEncrypted = crypto.publicEncrypt(
        {
            key: pem,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        },
        secretKeyBase64Buffer,
    );

    return {
        secretKey,
        sessionId: secretKeyBase64BufferEncrypted.toString("base64"),
    };
}

export async function decryptSecret(base64Secret: string, base64Iv: string, secretKey: string) {
    if (!base64Secret) throw new Error("base64Secret is required");
    if (!base64Iv) throw new Error("base64Iv is required");
    if (!secretKey || !/^[0-9A-Fa-f]+$/.test(secretKey)) {
        throw new Error("secretKey must be a hex string");
    }

    const secret = Buffer.from(base64Secret, "base64");
    const iv = Buffer.from(base64Iv, "base64");
    const secretKeyBuffer = Buffer.from(secretKey, "hex");


    const cryptoKey = crypto.createDecipheriv("aes-128-gcm", secretKeyBuffer, iv);
    cryptoKey.setAutoPadding(false);

    const decrypted = cryptoKey.update(secret);

    return decrypted.toString("utf-8");
}