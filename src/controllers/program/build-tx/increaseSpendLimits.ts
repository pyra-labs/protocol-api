import { SpendLimitTimeframe } from "../../../types/enums/SpendLimitTimeframe.enum.js";

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
