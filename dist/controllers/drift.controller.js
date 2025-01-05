import config from "../config/config.js";
import { bnToDecimal } from "../utils/helpers.js";
import { Connection, PublicKey } from "@solana/web3.js";
import { HttpException } from "../utils/errors.js";
import { QuartzClient, MarketIndex } from "@quartz-labs/sdk";
export class DriftController {
    quartzClientPromise;
    rateCache = {};
    RATE_CACHE_DURATION = 60_000;
    constructor() {
        const connection = new Connection(config.RPC_URL);
        this.quartzClientPromise = QuartzClient.fetchClient(connection);
    }
    validateAddress(address) {
        try {
            const pubkey = new PublicKey(address);
            return pubkey;
        }
        catch {
            throw new HttpException(400, "Invalid address");
        }
    }
    async getQuartzUser(pubkey) {
        try {
            const quartzClient = await this.quartzClientPromise;
            return quartzClient.getQuartzAccount(pubkey);
        }
        catch {
            throw new HttpException(400, "Quartz account not found");
        }
    }
    validateMarketIndices(marketIndicesParam) {
        if (!marketIndicesParam) {
            throw new HttpException(400, "Market indices are required");
        }
        const decodedMarketIndices = decodeURIComponent(marketIndicesParam);
        const marketIndices = decodedMarketIndices.split(',').map(Number).filter(n => !Number.isNaN(n));
        if (marketIndices.length === 0) {
            throw new HttpException(400, "Invalid market index");
        }
        if (marketIndices.some(index => !MarketIndex.includes(index))) {
            throw new HttpException(400, "Unsupported market index");
        }
        return marketIndices;
    }
    getRate = async (req, res, next) => {
        try {
            const quartzClient = await this.quartzClientPromise;
            const marketIndices = this.validateMarketIndices(req.query.marketIndices);
            const now = Date.now();
            const uncachedMarketIndices = marketIndices.filter(index => {
                const cached = this.rateCache[index];
                return !cached || (now - cached.timestamp) > this.RATE_CACHE_DURATION;
            });
            if (uncachedMarketIndices.length > 0) {
                const promises = uncachedMarketIndices.map(async (index) => {
                    let depositRateBN;
                    let borrowRateBN;
                    try {
                        depositRateBN = await quartzClient.getDepositRate(index);
                        borrowRateBN = await quartzClient.getBorrowRate(index);
                    }
                    catch {
                        throw new HttpException(400, `Could not find rates for spot market index ${index}`);
                    }
                    // Update cache
                    this.rateCache[index] = {
                        depositRate: bnToDecimal(depositRateBN, 6),
                        borrowRate: bnToDecimal(borrowRateBN, 6),
                        timestamp: now
                    };
                });
                await Promise.all(promises);
            }
            const rates = marketIndices.reduce((acc, index) => Object.assign(acc, {
                [index]: {
                    depositRate: this.rateCache[index]?.depositRate,
                    borrowRate: this.rateCache[index]?.borrowRate
                }
            }), {});
            res.status(200).json(rates);
        }
        catch (error) {
            next(error);
        }
    };
    getBalance = async (req, res, next) => {
        try {
            const marketIndices = this.validateMarketIndices(req.query.marketIndices);
            const address = this.validateAddress(req.query.address);
            const user = await this.getQuartzUser(address).catch(() => {
                throw new HttpException(400, "Address is not a Quartz user");
            });
            const balancesValues = await Promise.all(marketIndices.map(async (index) => ({
                index,
                balance: await user.getTokenBalance(index)
            })));
            const balances = balancesValues.reduce((acc, { index, balance }) => Object.assign(acc, { [index]: balance }), {});
            res.status(200).json(balances);
        }
        catch (error) {
            next(error);
        }
    };
    getWithdrawLimit = async (req, res, next) => {
        try {
            const marketIndices = this.validateMarketIndices(req.query.marketIndices);
            const address = this.validateAddress(req.query.address);
            const user = await this.getQuartzUser(address).catch(() => {
                throw new HttpException(400, "Address is not a Quartz user");
            });
            const withdrawLimits = await Promise.all(marketIndices.map(index => user.getWithdrawalLimit(index)));
            res.status(200).json(withdrawLimits);
        }
        catch (error) {
            next(error);
        }
    };
    getHealth = async (req, res, next) => {
        try {
            const address = this.validateAddress(req.query.address);
            const user = await this.getQuartzUser(address).catch(() => {
                throw new HttpException(400, "Address is not a Quartz user");
            });
            const health = user.getHealth();
            res.status(200).json(health);
        }
        catch (error) {
            next(error);
        }
    };
}
//# sourceMappingURL=drift.controller.js.map