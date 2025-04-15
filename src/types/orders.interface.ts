export interface TimeLockResponse {
    owner: string;
    isOwnerPayer: boolean;
    releaseSlot: number;
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