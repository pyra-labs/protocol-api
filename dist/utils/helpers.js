"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTimestamp = exports.getGoogleAccessToken = exports.retryRPCWithBackoff = void 0;
exports.bnToDecimal = bnToDecimal;
exports.buildTransaction = buildTransaction;
exports.makeCreateAtaIxsIfNeeded = makeCreateAtaIxsIfNeeded;
exports.getWsolMint = getWsolMint;
exports.getJupiterSwapQuote = getJupiterSwapQuote;
exports.getTokenAccountBalance = getTokenAccountBalance;
exports.baseUnitToDecimal = baseUnitToDecimal;
const config_js_1 = __importDefault(require("../config/config.js"));
const sdk_1 = require("@quartz-labs/sdk");
const web3_js_1 = require("@solana/web3.js");
const web3_js_2 = require("@solana/web3.js");
const web3_js_3 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
function bnToDecimal(bn, decimalPlaces) {
    const decimalFactor = 10 ** decimalPlaces;
    return bn.toNumber() / decimalFactor;
}
const retryRPCWithBackoff = async (fn, retries, initialDelay, logger) => {
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
exports.retryRPCWithBackoff = retryRPCWithBackoff;
const getGoogleAccessToken = async () => {
    const jwtToken = JSON.stringify({
        iss: config_js_1.default.GOOGLE_CLIENT_EMAIL,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000)
    });
    const signedJwt = await signJwt(jwtToken, config_js_1.default.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"));
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
exports.getGoogleAccessToken = getGoogleAccessToken;
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
const getTimestamp = () => {
    const date = new Date();
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
};
exports.getTimestamp = getTimestamp;
async function buildTransaction(connection, instructions, address, lookupTables = []) {
    // TODO: Calculate actual compute unit and fee
    const ix_computeLimit = web3_js_2.ComputeBudgetProgram.setComputeUnitLimit({
        units: 200_000,
    });
    const ix_computePrice = web3_js_2.ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 1_250_000,
    });
    instructions.unshift(ix_computeLimit, ix_computePrice);
    const blockhash = (await connection.getLatestBlockhash()).blockhash;
    const messageV0 = new web3_js_3.TransactionMessage({
        payerKey: address,
        recentBlockhash: blockhash,
        instructions: instructions
    }).compileToV0Message(lookupTables);
    const transaction = new web3_js_1.VersionedTransaction(messageV0);
    return transaction;
}
async function makeCreateAtaIxsIfNeeded(connection, ata, authority, mint) {
    const oix_createAta = [];
    const ataInfo = await connection.getAccountInfo(ata);
    if (ataInfo === null) {
        oix_createAta.push((0, spl_token_1.createAssociatedTokenAccountInstruction)(authority, ata, authority, mint));
    }
    return oix_createAta;
}
function getWsolMint() {
    const mint = Object.values(sdk_1.TOKENS).find(token => token.name === "SOL")?.mint;
    if (!mint)
        throw new Error("wSolMint not found");
    return mint;
}
async function getJupiterSwapQuote(inputMint, outputMint, amount, slippageBps) {
    const quoteEndpoint = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint.toBase58()}&outputMint=${outputMint.toBase58()}&amount=${amount}&slippageBps=${slippageBps}&swapMode=ExactOut&onlyDirectRoutes=true`;
    const response = await fetch(quoteEndpoint);
    const body = await response.json();
    if (!response.ok)
        throw new Error(JSON.stringify(body.error) ?? `Could not fetch ${quoteEndpoint}`);
    return body;
}
async function getTokenAccountBalance(connection, tokenAccount) {
    try {
        const balance = await connection.getTokenAccountBalance(tokenAccount);
        return Number(balance.value.amount);
    }
    catch {
        return 0;
    }
}
function baseUnitToDecimal(baseUnits, marketIndex) {
    const token = sdk_1.TOKENS[marketIndex];
    return baseUnits / (10 ** token.decimalPrecision);
}
//# sourceMappingURL=helpers.js.map