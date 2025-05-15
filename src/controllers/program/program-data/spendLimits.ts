import { type QuartzUser, BN } from "@quartz-labs/sdk";

export function getRemainingTimeframeLimit(
    quartzUser: QuartzUser,
    currentSlot: BN
) {
    let spendLimit: BN;
    if (quartzUser.timeframeInSeconds.lte(new BN(0))) {
        // If timeframe is 0, spendlimit is 0
        spendLimit = new BN(0);
    } else {
        if ((currentSlot).gte(quartzUser.nextTimeframeResetTimestamp)) {
            // If spendLimitPerTimeframe will be reset, use full spendLimit
            spendLimit = quartzUser.spendLimitPerTimeframe;
        } else {
            // Else, use remainingSpendLimit
            spendLimit = quartzUser.remainingSpendLimitPerTimeframe;
        }
        // Final spendLimit is the minimum of timeframe and transaction limits
        spendLimit = BN.min(spendLimit, quartzUser.spendLimitPerTransaction);
    }

    return spendLimit;
}
