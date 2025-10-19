import type { NextFunction, Request, Response } from "express";
import {
	SendTransactionError,
	TransactionExpiredBlockheightExceededError,
	VersionedTransaction,
} from "@solana/web3.js";
import { Controller } from "../../types/controller.class.js";
import {
	getTimeLockRentPayerPublicKey,
	retryWithBackoff,
} from "@quartz-labs/sdk";
import { z } from "zod";
import config from "../../config/config.js";
import AdvancedConnection from "@quartz-labs/connection";
import { validateParams } from "../../utils/helpers.js";
import { MIN_TIME_LOCK_RENT_PAYER_BALANCE } from "../../config/constants.js";

export class TxController extends Controller {
	private readonly MAX_DURATION = 70; // 70 second maximum in Vercel
	private connection: AdvancedConnection;

	constructor() {
		super();
		this.connection = new AdvancedConnection(config.RPC_URLS);
	}

	public confirmTx = async (
		req: Request,
		res: Response,
		next: NextFunction,
	) => {
		try {
			const paramsSchema = z.object({
				signature: z
					.string({
						required_error: "signature is required",
						invalid_type_error: "signature must be a string",
					})
					.min(1, "signature cannot be empty"),
			});

			const { signature } = await validateParams(paramsSchema, req);

			const CONFIRMATION_METHOD_DURATION = 50_000; // Allow enough time for confirmTransaction to timeout
			const startTime = Date.now();
			const maxDurationMs = this.MAX_DURATION * 1_000;

			let lastError: any = null;
			while (
				Date.now() - startTime <
				maxDurationMs - CONFIRMATION_METHOD_DURATION
			) {
				try {
					const result = await this.connection.confirmTransaction(
						{
							signature,
							...(await this.connection.getLatestBlockhash()),
						},
						"confirmed",
					);
					const success = result.value.err === null;

					res.status(200).json({
						signature: signature,
						success: success,
						timeout: false,
					});
					return;
				} catch (error) {
					lastError = error;
				}
			}

			if (lastError instanceof TransactionExpiredBlockheightExceededError) {
				res.status(404).json({
					signature: signature,
					success: false,
					timeout: true,
				});
				return;
			}

			console.error(lastError);
			res.status(500).json({ error: `Internal server error: ${lastError}` });
			return;
		} catch (error) {
			next(error);
		}
	};

	public sendTransaction = async (
		req: Request,
		res: Response,
		_: NextFunction,
	): Promise<void> => {
		const paramsSchema = z.object({
			transaction: z
				.string()
				.regex(/^[A-Za-z0-9+/]+={0,2}$/, "Must be a valid base64 string")
				.transform((val) => {
					const buffer = Buffer.from(val, "base64");
					VersionedTransaction.deserialize(buffer); // Validate it's a valid VersionedTransaction
					return buffer;
				}),
			skipPreflight: z.boolean().optional().default(false),
		});

		const { transaction, skipPreflight } = await validateParams(
			paramsSchema,
			req,
		);

		try {
			const signature = await retryWithBackoff(
				async () =>
					this.connection.sendRawTransaction(transaction, {
						skipPreflight,
					}),
				3,
			);

			res.status(200).json({ signature });
		} catch (error) {
			if (error instanceof SendTransactionError) {
				const logs = await error
					.getLogs(this.connection)
					.catch(() => [error.message]);
				res.status(500).json({
					error: `Transaction failed: ${error.message}`,
					logs: logs,
				});
				return;
			}

			res.status(500).json({ error: `${error}` });
		}
	};

	public isUserPayingOrderRent = async (
		_: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> => {
		try {
			const rentPayerBalance = await this.connection.getBalance(
				getTimeLockRentPayerPublicKey(),
			);
			const isUserPaying = rentPayerBalance < MIN_TIME_LOCK_RENT_PAYER_BALANCE;

			res.status(200).json(isUserPaying);
		} catch (error) {
			console.error(error);
			next(error);
		}
	};
}
