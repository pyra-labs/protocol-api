import config from "../config/config.js";
import { bnToDecimal } from "../utils/helpers.js";
import { Connection, PublicKey } from "@solana/web3.js";
import { HttpException } from "../utils/errors.js";
import { QuartzClient, MarketIndex, retryWithBackoff } from "@quartz-labs/sdk";
import { Controller } from "../types/controller.class.js";
import { PriceFetcherService } from "../services/priceFetcher.service.js";
export class UserController extends Controller {
    quartzClientPromise;
    priceFetcher;
    rateCache = {};
    RATE_CACHE_DURATION = 60_000;
    constructor() {
        super();
        const connection = new Connection(config.RPC_URL);
        this.quartzClientPromise = QuartzClient.fetchClient(connection);
        this.priceFetcher = PriceFetcherService.getPriceFetcherService();
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
            return await retryWithBackoff(() => quartzClient.getQuartzAccount(pubkey), 2);
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
                        depositRateBN = await retryWithBackoff(() => quartzClient.getDepositRate(index), 3);
                        borrowRateBN = await retryWithBackoff(() => quartzClient.getBorrowRate(index), 3);
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
            const user = await this.getQuartzUser(address);
            const balancesBN = await retryWithBackoff(() => user.getMultipleTokenBalances(marketIndices), 3);
            const balances = Object.entries(balancesBN).reduce((acc, [index, balance]) => Object.assign(acc, {
                [index]: balance.toNumber()
            }), {});
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
            const user = await this.getQuartzUser(address);
            const withdrawLimits = await retryWithBackoff(() => user.getMultipleWithdrawalLimits(marketIndices, true), 3);
            res.status(200).json(withdrawLimits);
        }
        catch (error) {
            next(error);
        }
    };
    getBorrowLimit = async (req, res, next) => {
        try {
            const marketIndices = this.validateMarketIndices(req.query.marketIndices);
            const address = this.validateAddress(req.query.address);
            const user = await this.getQuartzUser(address);
            const borrowLimits = await retryWithBackoff(() => user.getMultipleWithdrawalLimits(marketIndices, false), 3);
            res.status(200).json(borrowLimits);
        }
        catch (error) {
            next(error);
        }
    };
    getHealth = async (req, res, next) => {
        try {
            const address = this.validateAddress(req.query.address);
            const user = await this.getQuartzUser(address);
            const health = user.getHealth();
            res.status(200).json(health);
        }
        catch (error) {
            next(error);
        }
    };
    getSpendableBalance = async (req, res, next) => {
        try {
            const address = this.validateAddress(req.query.address);
            const user = await this.getQuartzUser(address);
            const spendableBalance = await user.getSpendableBalanceUsdcBaseUnits();
            res.status(200).json(spendableBalance);
        }
        catch (error) {
            next(error);
        }
    };
}
//# sourceMappingURL=user.controller.js.map