import config from "../config/config.js";
import { TOKENS, type BN, type MarketIndex, retryWithBackoff } from "@quartz-labs/sdk";
import { VersionedTransaction } from "@solana/web3.js";
import type { Connection } from "@solana/web3.js";
import type { TransactionInstruction } from "@solana/web3.js";
import type { PublicKey } from "@solana/web3.js";
import type { AddressLookupTableAccount } from "@solana/web3.js";
import { ComputeBudgetProgram } from "@solana/web3.js";
import { TransactionMessage } from "@solana/web3.js";
import { createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import { z } from "zod";
import { HttpException } from "./errors.js";
import type { Request } from "express";
import { SpendLimitTimeframe } from "../types/enums/SpendLimitTimeframe.enum.js";
import { AVERAGE_SLOT_TIME_MS } from "../config/constants.js";

export async function validateParams<T extends z.ZodSchema>(
    schema: T,
    req: Request
): Promise<z.infer<T>> {
    try {
        const params = req.method === "GET" ? req.query : req.body;
        return await schema.parseAsync(params);
    } catch (error) {
        if (error instanceof z.ZodError && error.errors[0]) {
            throw new HttpException(400, error.errors[0].message);
        }
        throw new HttpException(500, "Could not validate request parameters");
    }
}

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

export async function fetchAndParse<T>(
    url: string,
    req?: RequestInit | undefined,
    retries = 0
): Promise<T> {
    const response = await retryWithBackoff(
        async () => fetch(url, req),
        retries
    );

    if (!response.ok) {
        let body: any;
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
        return body as T;
    } catch {
        return response as T;
    }
}

export function getNextTimeframeReset(timeframe: SpendLimitTimeframe): number {
    const reset = new Date();

    switch (timeframe) {
        case SpendLimitTimeframe.DAY:
            reset.setUTCDate(reset.getUTCDate() + 1);
            reset.setUTCHours(0, 0, 0, 0);
            break;

        case SpendLimitTimeframe.WEEK:
            reset.setUTCDate(reset.getUTCDate() + ((8 - reset.getUTCDay()) % 7 || 7)); // Get next Monday
            reset.setUTCHours(0, 0, 0, 0);
            break;

        case SpendLimitTimeframe.MONTH:
            reset.setUTCMonth(reset.getUTCMonth() + 1); // Automatically handles rollover to next year
            reset.setUTCDate(1);
            reset.setUTCHours(0, 0, 0, 0);
            break;

        case SpendLimitTimeframe.YEAR:
            reset.setUTCFullYear(reset.getUTCFullYear() + 1);
            reset.setUTCMonth(0);
            reset.setUTCDate(1);
            reset.setUTCHours(0, 0, 0, 0);
            break;

        default:
            throw new Error("Invalid spend limit timeframe");
    }

    return Math.trunc(reset.getTime() / 1000); // Convert milliseconds to seconds
}

export function getSlotTimestamp(
    targetSlot: number,
    currentSlot: number,
    currentTimestamp: number = Date.now()
) {
    const slotDifference = targetSlot - currentSlot;
    const estimatedTimeOffset = slotDifference * AVERAGE_SLOT_TIME_MS;
    return currentTimestamp + estimatedTimeOffset;
}