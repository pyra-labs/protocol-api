import { Connection, PublicKey } from '@solana/web3.js';
import { BN, QuartzClient } from "@quartz-labs/sdk";
import { HttpException } from '../../../utils/errors.js';
export const getSpendLimits = async (address, connection, quartzClient) => {
    let user;
    try {
        user = await quartzClient.getQuartzAccount(address);
    }
    catch {
        throw new HttpException(400, "User not found");
    }
    const currentSlot = await connection.getSlot();
    const spendLimitTImeframeRemaining = getRemainingTimeframeLimit(user, new BN(currentSlot));
    return {
        timeframe: user.timeframeInSeconds.toNumber(),
        spendLimitTransactionBaseUnits: user.spendLimitPerTransaction.toNumber(),
        spendLimitTimeframeBaseUnits: user.spendLimitPerTimeframe.toNumber(),
        spendLimitTimeframeRemainingBaseUnits: spendLimitTImeframeRemaining.toNumber()
    };
};
function getRemainingTimeframeLimit(quartzUser, currentSlot) {
    let spendLimit;
    if (quartzUser.timeframeInSeconds.lte(new BN(0))) {
        // If timeframe is 0, spendlimit is 0
        spendLimit = new BN(0);
    }
    else {
        if ((currentSlot).gte(quartzUser.nextTimeframeResetTimestamp)) {
            // If spendLimitPerTimeframe will be reset, use full spendLimit
            spendLimit = quartzUser.spendLimitPerTimeframe;
        }
        else {
            // Else, use remainingSpendLimit
            spendLimit = quartzUser.remainingSpendLimitPerTimeframe;
        }
        // Final spendLimit is the minimum of timeframe and transaction limits
        spendLimit = BN.min(spendLimit, quartzUser.spendLimitPerTransaction);
    }
    return spendLimit;
}
//# sourceMappingURL=spendLimits.js.map