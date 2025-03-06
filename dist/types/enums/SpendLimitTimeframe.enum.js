import { SECONDS_PER_DAY } from "../../config/constants.js";
export var SpendLimitTimeframe;
(function (SpendLimitTimeframe) {
    SpendLimitTimeframe[SpendLimitTimeframe["UNKNOWN"] = 0] = "UNKNOWN";
    SpendLimitTimeframe[SpendLimitTimeframe["DAY"] = 86400] = "DAY";
    SpendLimitTimeframe[SpendLimitTimeframe["WEEK"] = 604800] = "WEEK";
    SpendLimitTimeframe[SpendLimitTimeframe["MONTH"] = 2592000] = "MONTH";
    SpendLimitTimeframe[SpendLimitTimeframe["YEAR"] = 31536000] = "YEAR";
})(SpendLimitTimeframe || (SpendLimitTimeframe = {}));
export var SpendLimitTimeframeDisplay;
(function (SpendLimitTimeframeDisplay) {
    SpendLimitTimeframeDisplay["UNKNOWN"] = "Unknown";
    SpendLimitTimeframeDisplay["DAY"] = "Day";
    SpendLimitTimeframeDisplay["WEEK"] = "Week";
    SpendLimitTimeframeDisplay["MONTH"] = "Month";
    SpendLimitTimeframeDisplay["YEAR"] = "Year";
})(SpendLimitTimeframeDisplay || (SpendLimitTimeframeDisplay = {}));
export const timeframeToDisplay = (timeframe) => {
    const enumKey = SpendLimitTimeframe[timeframe];
    return enumKey ?
        SpendLimitTimeframeDisplay[enumKey] :
        SpendLimitTimeframeDisplay.UNKNOWN;
};
export const displayToTimeframe = (display) => {
    const key = Object.keys(SpendLimitTimeframeDisplay)
        .find(key => SpendLimitTimeframeDisplay[key] === display);
    return key ? SpendLimitTimeframe[key] : SpendLimitTimeframe.UNKNOWN;
};
//# sourceMappingURL=SpendLimitTimeframe.enum.js.map