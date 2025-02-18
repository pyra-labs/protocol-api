import { getMarketIndicesRecord, type MarketIndex, retryWithBackoff, TOKENS } from "@quartz-labs/sdk";

export class PriceFetcherService {
    private static instance: PriceFetcherService;

    private priceCache: Record<MarketIndex, { price: number; timestamp: number }> = getMarketIndicesRecord({ price: 0, timestamp: 0 });
    private PRICE_CACHE_DURATION = 60_000;

    private constructor() {}
    
    public static getPriceFetcherService() {
        if (!PriceFetcherService.instance) {
            PriceFetcherService.instance = new PriceFetcherService();
        }
        return PriceFetcherService.instance;
    }

    public async getPrices() {
        const now = Date.now();
        const uncachedIndices = Object.keys(this.priceCache).filter(id => {
            const cached = this.priceCache[Number(id) as MarketIndex];
            return !cached || (now - cached.timestamp) > this.PRICE_CACHE_DURATION;
        });

        if (uncachedIndices.length > 0) {
            const ids = uncachedIndices.map(id => TOKENS[Number(id) as MarketIndex].coingeckoPriceId).join(',');

            const data = await retryWithBackoff(
                async () => {
                    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
                    if (!response.ok) {
                        throw new Error("Failed to fetch data from CoinGecko");
                    }
                    const body = await response.json();
                    return body as Record<string, { usd: number }>;
                },
                3
            )

            for (const id of Object.keys(data)) {
                if (!data[id]) throw new Error(`Invalid data fetched for ${id}`);

                const marketIndexStr = Object.entries(TOKENS).find(([_, token]) => token.coingeckoPriceId === id)?.[0];
                if (!marketIndexStr) throw new Error(`Invalid market index for ${id}`);

                const marketIndex = Number(marketIndexStr) as MarketIndex;
                this.priceCache[marketIndex] = {
                    price: data[id].usd,
                    timestamp: now
                }
            }
        }

        const pricesUsd = Object.keys(this.priceCache).reduce((acc, index) => {
            if (this.priceCache[Number(index) as MarketIndex]) {
                acc[Number(index) as MarketIndex] = this.priceCache[Number(index) as MarketIndex].price;
            }
            return acc;
        }, {} as Record<MarketIndex, number>);

        return pricesUsd;
    }
}