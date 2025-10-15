import {
	type MarketIndex,
	TOKENS,
	type BN,
	retryWithBackoff,
	buildEndpointURL,
} from "@quartz-labs/sdk";
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
import {
	AVERAGE_SLOT_TIME_MS,
	JLP_IDL_URL,
	JLP_POOL,
	LST_MARKET_INDICES,
} from "../config/constants.js";
import { BorshCoder, type Idl } from "@coral-xyz/anchor";

export const truncToDecimalPlaces = (
	value: number | undefined,
	decimalPlaces: number,
): number => {
	if (!value) return 0;
	return Math.trunc(value * 10 ** decimalPlaces) / 10 ** decimalPlaces;
};

export async function validateParams<T extends z.ZodSchema>(
	schema: T,
	req: Request,
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

export const getTimestamp = () => {
	const date = new Date();
	const day = date.getDate().toString().padStart(2, "0");
	const month = (date.getMonth() + 1).toString().padStart(2, "0");
	const year = date.getFullYear();
	const hours = date.getHours().toString().padStart(2, "0");
	const minutes = date.getMinutes().toString().padStart(2, "0");
	const seconds = date.getSeconds().toString().padStart(2, "0");
	return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
};

export async function buildTransaction(
	connection: Connection,
	instructions: TransactionInstruction[],
	address: PublicKey,
	lookupTables: AddressLookupTableAccount[] = [],
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
		instructions: instructions,
	}).compileToV0Message(lookupTables);
	const transaction = new VersionedTransaction(messageV0);
	return transaction;
}

export async function makeCreateAtaIxsIfNeeded(
	connection: Connection,
	ata: PublicKey,
	authority: PublicKey,
	mint: PublicKey,
) {
	const oix_createAta: TransactionInstruction[] = [];
	const ataInfo = await connection.getAccountInfo(ata);
	if (ataInfo === null) {
		oix_createAta.push(
			createAssociatedTokenAccountInstruction(authority, ata, authority, mint),
		);
	}
	return oix_createAta;
}

export function getWsolMint() {
	const mint = Object.values(TOKENS).find(
		(token) => token.name === "SOL",
	)?.mint;
	if (!mint) throw new Error("wSolMint not found");
	return mint;
}

export async function getJupiterSwapQuote(
	inputMint: PublicKey,
	outputMint: PublicKey,
	amount: number,
	slippageBps: number,
) {
	const quoteEndpoint = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint.toBase58()}&outputMint=${outputMint.toBase58()}&amount=${amount}&slippageBps=${slippageBps}&swapMode=ExactOut&onlyDirectRoutes=true`;
	const response = await fetch(quoteEndpoint);
	const body: any = await response.json();
	if (!response.ok)
		throw new Error(
			JSON.stringify(body.error) ?? `Could not fetch ${quoteEndpoint}`,
		);
	return body;
}

export async function getTokenAccountBalance(
	connection: Connection,
	tokenAccount: PublicKey,
) {
	try {
		const balance = await connection.getTokenAccountBalance(tokenAccount);
		return Number(balance.value.amount);
	} catch {
		return 0;
	}
}

export function baseUnitToDecimal(
	baseUnits: number,
	marketIndex: MarketIndex,
): number {
	const token = TOKENS[marketIndex];
	return baseUnits / 10 ** token.decimalPrecision.toNumber();
}

export async function fetchAndParse<T>(
	url: string,
	req?: RequestInit | undefined,
	retries = 0,
): Promise<T> {
	const response = await retryWithBackoff(async () => fetch(url, req), retries);

	if (!response.ok) {
		let body: any;
		try {
			body = await response.json();
		} catch {
			body = null;
		}
		const error = {
			status: response.status,
			body,
		};
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
	currentTimestamp: number = Date.now(),
) {
	const slotDifference = targetSlot - currentSlot;
	const estimatedTimeOffset = slotDifference * AVERAGE_SLOT_TIME_MS;
	return currentTimestamp + estimatedTimeOffset;
}

export async function getNativeLstApy(marketIndex: MarketIndex) {
	if (!LST_MARKET_INDICES.includes(marketIndex)) {
		return 0;
	}

	const name = TOKENS[marketIndex].name;

	const endpoint = buildEndpointURL(
		"https://extra-api.sanctum.so/v1/apy/latest",
		{
			lst: name,
		},
	);
	const response = await fetchAndParse<{
		apys: {
			[key: string]: number;
		};
		errs: any;
	}>(endpoint);

	return truncToDecimalPlaces(response.apys[name], 6);
}

const fetchJson = async <T>(url: string, init?: RequestInit) =>
	(await (await fetch(url, init)).json()) as T;

export async function getJlpApr(connection: Connection) {
	const idl = await fetchJson<Idl>(JLP_IDL_URL);
	const coder = new BorshCoder(idl);
	const info = await connection.getAccountInfo(JLP_POOL);
	if (!info?.data) throw new Error("Pool account not found");
	let acc: any;
	try {
		acc = coder.accounts.decode("pool", info.data);
	} catch {
		acc = coder.accounts.decode("Pool", info.data);
	}
	const v = acc?.poolApr?.feeAprBps;
	if (v == null) throw new Error("feeAprBps missing on Pool account");
	const bps =
		typeof v === "number"
			? v
			: typeof v === "bigint"
				? Number(v)
				: typeof v?.toNumber === "function"
					? v.toNumber()
					: Number(v?.toString?.() ?? 0);
	const percentage = bps / 100;
	return percentage / 100;
}
