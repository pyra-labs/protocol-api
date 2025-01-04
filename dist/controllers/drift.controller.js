"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DriftController = void 0;
const config_js_1 = __importDefault(require("../config/config.js"));
const helpers_js_1 = require("../utils/helpers.js");
const web3_js_1 = require("@solana/web3.js");
const errors_js_1 = require("../utils/errors.js");
const sdk_1 = require("@quartz-labs/sdk");
class DriftController {
    quartzClientPromise;
    rateCache = {};
    RATE_CACHE_DURATION = 60_000;
    constructor() {
        const connection = new web3_js_1.Connection(config_js_1.default.RPC_URL);
        this.quartzClientPromise = sdk_1.QuartzClient.fetchClient(connection);
    }
    validateAddress(address) {
        try {
            const pubkey = new web3_js_1.PublicKey(address);
            return pubkey;
        }
        catch {
            throw new errors_js_1.HttpException(400, "Invalid address");
        }
    }
    async getQuartzUser(pubkey) {
        try {
            const quartzClient = await this.quartzClientPromise;
            return quartzClient.getQuartzAccount(pubkey);
        }
        catch {
            throw new errors_js_1.HttpException(400, "Quartz account not found");
        }
    }
    validateMarketIndices(marketIndicesParam) {
        if (!marketIndicesParam) {
            throw new errors_js_1.HttpException(400, "Market indices are required");
        }
        const decodedMarketIndices = decodeURIComponent(marketIndicesParam);
        const marketIndices = decodedMarketIndices.split(',').map(Number).filter(n => !Number.isNaN(n));
        if (marketIndices.length === 0) {
            throw new errors_js_1.HttpException(400, "Invalid market index");
        }
        if (marketIndices.some(index => !sdk_1.MarketIndex.includes(index))) {
            throw new errors_js_1.HttpException(400, "Unsupported market index");
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
                        throw new errors_js_1.HttpException(400, `Could not find rates for spot market index ${index}`);
                    }
                    // Update cache
                    this.rateCache[index] = {
                        depositRate: (0, helpers_js_1.bnToDecimal)(depositRateBN, 6),
                        borrowRate: (0, helpers_js_1.bnToDecimal)(borrowRateBN, 6),
                        timestamp: now
                    };
                });
                await Promise.all(promises);
            }
            const rates = marketIndices.map(index => ({
                depositRate: this.rateCache[index]?.depositRate,
                borrowRate: this.rateCache[index]?.borrowRate
            }));
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
                throw new errors_js_1.HttpException(400, "Address is not a Quartz user");
            });
            const balances = await Promise.all(marketIndices.map(index => user.getTokenBalance(index)));
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
                throw new errors_js_1.HttpException(400, "Address is not a Quartz user");
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
                throw new errors_js_1.HttpException(400, "Address is not a Quartz user");
            });
            const health = user.getHealth();
            res.status(200).json(health);
        }
        catch (error) {
            next(error);
        }
    };
}
exports.DriftController = DriftController;
//# sourceMappingURL=drift.controller.js.map