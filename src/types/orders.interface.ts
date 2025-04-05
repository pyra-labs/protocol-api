import type { PublicKey } from "@solana/web3.js";

export interface TimeLockResponse {
    owner: PublicKey;
    isOwnerPayer: boolean;
    releaseSlot: number;
}

export interface WithdrawOrderResponse {
    timeLock: TimeLockResponse;
    amountBaseUnits: number;
    driftMarketIndex: number;
    reduceOnly: boolean;
}

export interface WithdrawOrderAccountResponse {
    publicKey: PublicKey;
    account: WithdrawOrderResponse;
}

export interface SpendLimitsOrderResponse {
    timeLock: TimeLockResponse;
    spendLimitPerTransaction: number;
    spendLimitPerTimeframe: number;
    timeframeInSeconds: number;
    nextTimeframeResetTimestamp: number;
}

export interface SpendLimitsOrderAccountResponse {
    publicKey: PublicKey;
    account: SpendLimitsOrderResponse;
}