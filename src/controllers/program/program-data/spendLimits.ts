import { type QuartzUser, BN, ZERO } from "@quartz-labs/sdk";

export function getRemainingTimeframeLimit(
    quartzUser: QuartzUser,
    now: number = Date.now()
) {
    const nowSeconds = Math.floor(now / 1000);

    if (quartzUser.timeframeInSeconds.lte(new BN(0))) {
        // If timeframe is 0, spendlimit is 0
        return ZERO;
    }
    
    if (nowSeconds >= quartzUser.nextTimeframeResetTimestamp) {
        // If spendLimitPerTimeframe will be reset, use full spendLimit
        return quartzUser.spendLimitPerTimeframe;
    }

    // Else, use remainingSpendLimit
    return quartzUser.remainingSpendLimitPerTimeframe;
}
