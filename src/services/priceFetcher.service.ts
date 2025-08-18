import { getMarketIndicesRecord, getPrices, type MarketIndex, retryWithBackoff } from "@quartz-labs/sdk";

export class PriceFetcherService {
    private static instance: PriceFetcherService;

    private priceCache: Record<MarketIndex, { price: number; timestamp: number }> = getMarketIndicesRecord({ price: 0, timestamp: 0 });
    private PRICE_CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

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
            const data = await retryWithBackoff(
                async () => await getPrices(false), // CoinGecko API first, then Pyth
                3
            );
            console.log(data);

            // Update price cache with new data
            for (const [marketIndex, price] of Object.entries(data)) {
                this.priceCache[Number(marketIndex) as MarketIndex] = {
                    price: price,
                    timestamp: now
                };
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