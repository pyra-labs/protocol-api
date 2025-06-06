import { BN } from "@quartz-labs/sdk";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export const BASE_UNITS_PER_USDC = 1_000_000;
export const JUPITER_SLIPPAGE_BPS = 50;

export const SECONDS_PER_DAY = 60 * 60 * 24;

export const DEFAULT_REFETCH_INTERVAL = 60_000;
export const MICRO_LAMPORTS_PER_LAMPORT = 1_000_000;
export const DEFAULT_COMPUTE_UNIT_LIMIT = 400_000;
export const DEFAULT_COMPUTE_UNIT_PRICE = 1_250_000;


export const DEFAULT_CARD_TRANSACTION_LIMIT = new BN(1000_000_000); //$1,000
export const DEFAULT_CARD_TIMEFRAME_LIMIT = new BN(0);
export const DEFAULT_CARD_TIMEFRAME = new BN(SECONDS_PER_DAY);
export const DEFAULT_CARD_TIMEFRAME_RESET = new BN(0);

export const DUST_BUFFER_BASE_UNITS = 100;
export const MIN_TIME_LOCK_RENT_PAYER_BALANCE = 0.05 * LAMPORTS_PER_SOL;

export const AVERAGE_SLOT_TIME_MS = 400;
