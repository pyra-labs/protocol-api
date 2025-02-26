import type { NextFunction, Request, Response } from "express";
import { HttpException } from "../utils/errors.js";
import config from "../config/config.js";
import { YIELD_CUT } from "../config/constants.js";
import { bnToDecimal, getGoogleAccessToken, getTimestamp } from "../utils/helpers.js";
import { WebflowClient } from "webflow-api";
import { baseUnitToDecimal, MarketIndex, retryWithBackoff, TOKENS } from "@quartz-labs/sdk";
import { Controller } from "../types/controller.class.js";
import { PriceFetcherService } from "../services/priceFetcher.service.js";
import { quartzClient } from "../index.js";

export class DataController extends Controller {
    private priceFetcher: PriceFetcherService;

    constructor() {
        super();
        this.priceFetcher = PriceFetcherService.getPriceFetcherService();
    }

    public getPrice = async (_: Request, res: Response, next: NextFunction) => {        
        try {
            const prices = await this.priceFetcher.getPrices();

            res.status(200).json(prices);
        } catch (error) {
            next(error);
        }
    }

    public getUsers = async (_: Request, res: Response, next: NextFunction) => {
        try {
            const owners = await retryWithBackoff(
                () => quartzClient.getAllQuartzAccountOwnerPubkeys()
            );

            res.status(200).json({
                count: owners.length,
                users: owners
            });
        } catch (error) {
            next(error);
        }
    }

    public getTVL = async (_: Request, res: Response, next: NextFunction) => {
        try {
            const users = await retryWithBackoff(
                async () => {
                    const owners = await quartzClient.getAllQuartzAccountOwnerPubkeys();
                    const users = await quartzClient.getMultipleQuartzAccounts(owners);
                    return users;
                }
            );

            let totalCollateralValue = 0;
            let totalLoansValue = 0;

            const prices = await this.priceFetcher.getPrices();
            for (const user of users) {
                if (!user) continue; // TODO: Remove once deleted Drift users is fixed

                const balances = await user.getMultipleTokenBalances([...MarketIndex]);

                for (const [index, balance] of Object.entries(balances)) {
                    const marketIndex = Number(index) as MarketIndex;
                    const price = prices[marketIndex];
                    const value = baseUnitToDecimal(balance.toNumber(), marketIndex) * price;
                    if (value > 0) {
                        totalCollateralValue += value;
                    } else {
                        totalLoansValue += Math.abs(value);
                    }
                }
            }

            res.status(200).json({
                collateral: totalCollateralValue.toFixed(2),
                loans: totalLoansValue.toFixed(2),
                net: (totalCollateralValue - totalLoansValue).toFixed(2)
            });
        } catch (error) {
            next(error);
        }
    }

    public addWaitlist = async (req: Request, res: Response, next: NextFunction) => {
        const email = req.body.email as string;
        if (!email) return next(new HttpException(400, "Email is required"));
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return next(new HttpException(400, "Invalid email"));

        const name = req.body.name as string;
        if (!name) return next(new HttpException(400, "Name is required"));

        const country = req.body.country as string;
        if (!country) return next(new HttpException(400, "Country is required"));

        const newsletter = req.body.newsletter;
        if (newsletter === undefined || newsletter === null) {
            return next(new HttpException(400, "Newsletter is required"));
        }
        if (typeof newsletter !== "boolean") return next(new HttpException(400, "Newsletter must be a boolean"));

        this.getLogger().info(`Adding ${email} to waitlist.`, { name, country, newsletter });

        try {
            const accessToken = await getGoogleAccessToken();
            
            // Ensure waitlist is not already present
            const checkResponse = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${config.GOOGLE_SPREADSHEET_ID}/values/waitlist!B:B`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                    }
                }
            );
            if (!checkResponse.ok) {
                throw new Error(`Failed to find spreadsheet. Submitted data: ${JSON.stringify({ email, name, country, newsletter })}`);
            }
            const data = (await checkResponse.json()) as { values?: string[][]};
            const rows = data.values?.slice(1);
    
            if (!rows || rows.length === 0) {
                throw new Error(`Failed to fetch data from spreadsheet. Submitted data: ${JSON.stringify({ email, name, country, newsletter })}`);
            }
            if (rows.some((row: string[]) => row[0] === email)) {
                res.status(200).json({ message: "Email already exists in waitlist" });
                return;
            }

            // Append to waitlist
            const appendResponse = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${config.GOOGLE_SPREADSHEET_ID}/values/waitlist!A:F:append?valueInputOption=USER_ENTERED`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        values: [[getTimestamp(), email, name, country, newsletter ? "TRUE" : "FALSE", "1"]]
                    })
                }
            );
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
        } catch (error) {
            next(error);
        }
    }

    public updateWebsiteData = async (_: Request, res: Response, next: NextFunction) => {
        try {   
            const webflowClient = new WebflowClient({ accessToken: config.WEBFLOW_ACCESS_TOKEN });

            // Get USDC deposit rate
            const usdcMarketIndex = Object.entries(TOKENS).find(([_, token]) => token.name === "USDC")?.[0];
            if (!usdcMarketIndex) throw new Error("USDC market index not found");
            
            const usdcDepositRateBN = await quartzClient.getDepositRate(Number(usdcMarketIndex));
            const usdcDepositRate = bnToDecimal(usdcDepositRateBN, 6);
            if (usdcDepositRate <= 0) throw new Error("Invalid rate fetched");

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

            res.status(200).json({ yield: apyAfterCutRounded, valueLost: 0 });
        } catch (error) {
            next(error);
        }
    }
}
