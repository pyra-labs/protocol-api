import { getMarketIndicesRecord, retryWithBackoff, TOKENS } from "@quartz-labs/sdk";
export class PriceFetcherService {
    static instance;
    priceCache = getMarketIndicesRecord({ price: 0, timestamp: 0 });
    PRICE_CACHE_DURATION = 60_000;
    constructor() { }
    static getPriceFetcherService() {
        if (!PriceFetcherService.instance) {
            PriceFetcherService.instance = new PriceFetcherService();
        }
        return PriceFetcherService.instance;
    }
    async getPrices() {
        const now = Date.now();
        const uncachedIndices = Object.keys(this.priceCache).filter(id => {
            const cached = this.priceCache[Number(id)];
            return !cached || (now - cached.timestamp) > this.PRICE_CACHE_DURATION;
        });
        if (uncachedIndices.length > 0) {
            const ids = uncachedIndices.map(id => TOKENS[Number(id)].coingeckoPriceId).join(',');
            const data = await retryWithBackoff(async () => {
                const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
                if (!response.ok) {
                    throw new Error("Failed to fetch data from CoinGecko");
                }
                const body = await response.json();
                return body;
            }, 3);
            for (const id of Object.keys(data)) {
                if (!data[id])
                    throw new Error(`Invalid data fetched for ${id}`);
                const marketIndexStr = Object.entries(TOKENS).find(([_, token]) => token.coingeckoPriceId === id)?.[0];
                if (!marketIndexStr)
                    throw new Error(`Invalid market index for ${id}`);
                const marketIndex = Number(marketIndexStr);
                this.priceCache[marketIndex] = {
                    price: data[id].usd,
                    timestamp: now
                };
            }
        }
        const pricesUsd = Object.keys(this.priceCache).reduce((acc, index) => {
            if (this.priceCache[Number(index)]) {
                acc[Number(index)] = this.priceCache[Number(index)].price;
            }
            return acc;
        }, {});
        return pricesUsd;
    }
}
//# sourceMappingURL=priceFetcher.service.js.map