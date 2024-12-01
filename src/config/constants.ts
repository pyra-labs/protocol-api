import { PublicKey } from "@solana/web3.js";

export const SUPPORTED_DRIFT_MARKET_INDICES = [0, 1];
export const QUARTZ_HEALTH_BUFFER_PERCENTAGE = 10;
export const QUARTZ_PROGRAM_ID = new PublicKey("6JjHXLheGSNvvexgzMthEcgjkcirDrGduc3HAKB2P1v2");

export const BASE_UNITS_PER_USDC = 1_000_000;

export const DRIFT_MARKET_INDEX_USDC = 0;
export const DRIFT_MARKET_INDEX_SOL = 1;
export const SUPPORTED_DRIFT_MARKETS = [DRIFT_MARKET_INDEX_USDC, DRIFT_MARKET_INDEX_SOL];
