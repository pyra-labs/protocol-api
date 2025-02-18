import { HttpException } from "../utils/errors.js";
import { Connection } from "@solana/web3.js";
import config from "../config/config.js";
import { YIELD_CUT } from "../config/constants.js";
import { bnToDecimal, getGoogleAccessToken, getTimestamp } from "../utils/helpers.js";
import { WebflowClient } from "webflow-api";
import { MarketIndex, QuartzClient, retryWithBackoff, TOKENS } from "@quartz-labs/sdk";
import { Controller } from "../types/controller.class.js";
import { PriceFetcherService } from "../services/priceFetcher.service.js";
export class DataController extends Controller {
    quartzClientPromise;
    priceFetcher;
    constructor() {
        super();
        const connection = new Connection(config.RPC_URL);
        this.quartzClientPromise = QuartzClient.fetchClient(connection);
        this.priceFetcher = PriceFetcherService.getPriceFetcherService();
    }
    getPrice = async (req, res, next) => {
        const ids = req.query.ids;
        if (!ids)
            return next(new HttpException(400, "ID is required"));
        const decodedIds = decodeURIComponent(ids);
        const idArray = decodedIds.split(",");
        const isMarketIndex = (id) => {
            try {
                const num = Number(id);
                return Object.values(MarketIndex).includes(num);
            }
            catch {
                return false;
            }
        };
        try {
            let marketIndices = [];
            if (idArray.some(id => !isMarketIndex(id))) { // TODO: Only allow market indices, not coingecko ids
                marketIndices = idArray.map(id => {
                    const marketIndexStr = Object.entries(TOKENS).find(([_, token]) => token.coingeckoPriceId === id)?.[0];
                    if (!marketIndexStr)
                        throw new Error(`Invalid market index for ${id}`);
                    return Number(marketIndexStr);
                });
            }
            else {
                marketIndices = idArray.map(id => Number(id));
            }
            const prices = await this.priceFetcher.getPrices(marketIndices);
            res.status(200).json(prices);
        }
        catch (error) {
            next(error);
        }
    };
    getUsers = async (_, res, next) => {
        const quartzClient = await this.quartzClientPromise;
        try {
            const owners = await retryWithBackoff(() => quartzClient.getAllQuartzAccountOwnerPubkeys());
            res.status(200).json({
                count: owners.length,
                users: owners
            });
        }
        catch (error) {
            next(error);
        }
    };
    getTVL = async (_, res, next) => {
        const quartzClient = await this.quartzClientPromise;
        try {
            const users = await retryWithBackoff(async () => {
                const owners = await quartzClient.getAllQuartzAccountOwnerPubkeys();
                const users = await quartzClient.getMultipleQuartzAccounts(owners);
                return users;
            });
            let totalCollateralValue = 0;
            let totalLoansValue = 0;
            const prices = await this.priceFetcher.getPrices([...MarketIndex]);
            for (const user of users) {
                if (!user)
                    continue; // TODO: Remove once deleted Drift users is fixed
                const balances = await user.getMultipleTokenBalances([...MarketIndex]);
                for (const [index, balance] of Object.entries(balances)) {
                    const price = prices[Number(index)];
                    const value = balance.toNumber() * price;
                    if (value > 0) {
                        totalCollateralValue += value;
                    }
                    else {
                        totalLoansValue += value;
                    }
                }
            }
            res.status(200).json({
                collateral: totalCollateralValue.toFixed(2),
                loans: totalLoansValue.toFixed(2),
                net: (totalCollateralValue - totalLoansValue).toFixed(2)
            });
        }
        catch (error) {
            next(error);
        }
    };
    addWaitlist = async (req, res, next) => {
        const email = req.body.email;
        if (!email)
            return next(new HttpException(400, "Email is required"));
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            return next(new HttpException(400, "Invalid email"));
        const name = req.body.name;
        if (!name)
            return next(new HttpException(400, "Name is required"));
        const country = req.body.country;
        if (!country)
            return next(new HttpException(400, "Country is required"));
        const newsletter = req.body.newsletter;
        if (newsletter === undefined || newsletter === null) {
            return next(new HttpException(400, "Newsletter is required"));
        }
        if (typeof newsletter !== "boolean")
            return next(new HttpException(400, "Newsletter must be a boolean"));
        this.getLogger().info(`Adding ${email} to waitlist.`, { name, country, newsletter });
        try {
            const accessToken = await getGoogleAccessToken();
            // Ensure waitlist is not already present
            const checkResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${config.GOOGLE_SPREADSHEET_ID}/values/waitlist!B:B`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                }
            });
            if (!checkResponse.ok) {
                throw new Error(`Failed to find spreadsheet. Submitted data: ${JSON.stringify({ email, name, country, newsletter })}`);
            }
            const data = (await checkResponse.json());
            const rows = data.values?.slice(1);
            if (!rows || rows.length === 0) {
                throw new Error(`Failed to fetch data from spreadsheet. Submitted data: ${JSON.stringify({ email, name, country, newsletter })}`);
            }
            if (rows.some((row) => row[0] === email)) {
                res.status(200).json({ message: "Email already exists in waitlist" });
                return;
            }
            // Append to waitlist
            const appendResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${config.GOOGLE_SPREADSHEET_ID}/values/waitlist!A:F:append?valueInputOption=USER_ENTERED`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    values: [[getTimestamp(), email, name, country, newsletter ? "TRUE" : "FALSE", "1"]]
                })
            });
            if (!appendResponse.ok) {
                throw new Error(`Failed to update spreadsheet. Submitted data: ${JSON.stringify({ email, name, country, newsletter })}`);
            }
            // Update Webflow waitlist count
            const newWaitlistCount = rows.length + 1;
            const webflowClient = new WebflowClient({ accessToken: config.WEBFLOW_ACCESS_TOKEN });
            await webflowClient.collections.items.updateItemLive("67504dd7fde047775f88c371", "67504dd7fde047775f88c3aa", {
                id: "67504dd7fde047775f88c3aa",
                fieldData: {
                    name: "Waitlist",
                    slug: "waitlist",
                    count: newWaitlistCount
                }
            });
            // Send welcome email through Brevo
            await fetch("https://api.brevo.com/v3/smtp/email", {
                method: 'POST',
                headers: {
                    accept: 'application/json',
                    'content-type': 'application/json',
                    'api-key': config.BREVO_API_KEY
                },
                body: JSON.stringify({
                    templateId: 3,
                    to: [{ email, name }],
                    params: {
                        "NAME": name
                    }
                })
            });
            res.status(200).json({ message: "Email added to waitlist" });
        }
        catch (error) {
            next(error);
        }
    };
    updateWebsiteData = async (_, res, next) => {
        const quartzClient = await this.quartzClientPromise;
        const usdLost = 8592500000;
        const assetsLost = {
            "bitcoin": 1226903,
            "litecoin": 56733,
            "nem": 9000000,
            "nano": 17000000,
            "ripple": 48100000,
            "eos": 3000000,
            "ethereum": 11543,
            "cardano": 2500000,
            "tether": 20800000
        };
        try {
            const webflowClient = new WebflowClient({ accessToken: config.WEBFLOW_ACCESS_TOKEN });
            // Get USDC deposit rate
            const usdcMarketIndex = Object.entries(TOKENS).find(([_, token]) => token.name === "USDC")?.[0];
            if (!usdcMarketIndex)
                throw new Error("USDC market index not found");
            const usdcDepositRateBN = await quartzClient.getDepositRate(Number(usdcMarketIndex));
            const usdcDepositRate = bnToDecimal(usdcDepositRateBN, 6);
            if (usdcDepositRate <= 0)
                throw new Error("Invalid rate fetched");
            const apyAfterCut = 100 * usdcDepositRate * (1 - YIELD_CUT);
            const apyAfterCutRounded = Math.round((apyAfterCut + Number.EPSILON) * 100) / 100;
            // Update USDC deposit rate
            await webflowClient.collections.items.updateItemLive("67504dd7fde047775f88c371", "67504dd7fde047775f88c3be", {
                id: "67504dd7fde047775f88c3be",
                fieldData: {
                    name: "Yield",
                    slug: "yield",
                    count: apyAfterCutRounded
                }
            });
            // Get funds lost to custodians
            const ids = Object.keys(assetsLost).join(',');
            const mockReq = { query: { ids } };
            let prices = {};
            await new Promise((resolve) => {
                const mockRes = {
                    status: () => ({
                        json: (data) => {
                            prices = data;
                            resolve();
                        }
                    })
                };
                this.getPrice(mockReq, mockRes, next);
            });
            let totalValueLost = usdLost;
            for (const [coin, amount] of Object.entries(assetsLost)) {
                const price = prices[coin];
                if (!price)
                    throw new Error("Price not found");
                const value = price * amount;
                totalValueLost += value;
            }
            const totalValueLostBillions = Math.trunc(totalValueLost / 1_000_000_000);
            // Update funds lost to custodians
            await webflowClient.collections.items.updateItemLive("67504dd7fde047775f88c371", "67504dd7fde047775f88c3d0", {
                id: "67504dd7fde047775f88c3d0",
                fieldData: {
                    name: "Value Lost",
                    slug: "value-lost",
                    count: totalValueLostBillions
                }
            });
            res.status(200).json({ yield: apyAfterCutRounded, valueLost: totalValueLostBillions });
        }
        catch (error) {
            next(error);
        }
    };
}
//# sourceMappingURL=data.controller.js.map