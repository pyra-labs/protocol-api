export interface TimeLockResponse {
    owner: string;
    isOwnerPayer: boolean;
    releaseSlot: number;
    releaseTimestamp: number;
}

export interface WithdrawOrderResponse {
    timeLock: TimeLockResponse;
    amountBaseUnits: number;
    driftMarketIndex: number;
    reduceOnly: boolean;
    destination: string;
}

export interface WithdrawOrderAccountResponse {
    publicKey: string;
    account: WithdrawOrderResponse;
}

export interface WithdrawOrderInternalResponse {
    publicKey: string;
    account: {
        time_lock: {
            owner: string;
            is_owner_payer: boolean;
            release_slot: number;
        };
        amount_base_units: number;
        drift_market_index: number;
        reduce_only: boolean;
        destination: string;
    }
}

export interface SpendLimitsOrderResponse {
    timeLock: TimeLockResponse;
    spendLimitPerTransaction: number;
    spendLimitPerTimeframe: number;
    timeframeInSeconds: number;
    nextTimeframeResetTimestamp: number;
}

export interface SpendLimitsOrderAccountResponse {
    publicKey: string;
    account: SpendLimitsOrderResponse;
}

export interface SpendLimitsOrderInternalResponse {
    publicKey: string;
    account: {
        time_lock: {
            owner: string;
            is_owner_payer: boolean;
            release_slot: number;
        };
        spend_limit_per_transaction: number;
        spend_limit_per_timeframe: number;
        timeframe_in_seconds: number;
        next_timeframe_reset_timestamp: number;
    }
}
