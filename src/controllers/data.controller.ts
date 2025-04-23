import type { NextFunction, Request, Response } from "express";
import { HttpException } from "../utils/errors.js";
import { Connection } from "@solana/web3.js";
import config from "../config/config.js";
import { YIELD_CUT } from "../config/constants.js";
import { bnToDecimal, getGoogleAccessToken, getTimestamp } from "../utils/helpers.js";
import { WebflowClient } from "webflow-api";
import { baseUnitToDecimal, delay, MARKET_INDEX_USDC, type MarketIndex, QuartzClient, retryWithBackoff } from "@quartz-labs/sdk";
import { Controller } from "../types/controller.class.js";
import { PriceFetcherService } from "../services/priceFetcher.service.js";

export class DataController extends Controller {
    private quartzClientPromise: Promise<QuartzClient>;
    private priceFetcher: PriceFetcherService;
    private connection: Connection;

    constructor() {
        super();
        this.connection = new Connection(config.RPC_URL);
        this.quartzClientPromise = QuartzClient.fetchClient(this.connection);
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
        const quartzClient = await this.quartzClientPromise || QuartzClient.fetchClient(this.connection);    

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
            const quartzClient = await this.quartzClientPromise || QuartzClient.fetchClient(this.connection);   

            const owners = await quartzClient.getAllQuartzAccountOwnerPubkeys();
            const users = await quartzClient.getMultipleQuartzAccounts(owners).then(
                (accounts) => accounts.filter((account) => account !== null)
            );

            await delay(1_000); // Prevent RPC rate limiting

            const prices = await this.priceFetcher.getPrices();
            let collateral = 0;
            let loans = 0;

            for (const user of users) {
                const collateralValueUsdc = await user.getTotalCollateralValue();
                const collateralValue = baseUnitToDecimal(collateralValueUsdc, MARKET_INDEX_USDC);

                const liabilityValueUsdc = await user.getTotalSpotLiabilityValue();
                const liabilityValue = baseUnitToDecimal(liabilityValueUsdc, MARKET_INDEX_USDC);
                const idleBalance = await user.getAllDepositAddressBalances();

                let idleValue = 0;
                for (const [index, balance] of Object.entries(idleBalance)) {
                    const marketIndex = Number.parseInt(index) as MarketIndex;

                    const balanceDecimal = baseUnitToDecimal(balance.toNumber(), marketIndex);
                    idleValue += prices[marketIndex] * balanceDecimal;
                }
                
                collateral += collateralValue + idleValue;
                loans += liabilityValue;

                await delay(1_000); // Prevent RPC rate limiting
            }

            res.status(200).json({
                collateral: collateral.toFixed(2),
                loans: loans.toFixed(2),
                net: (collateral - loans).toFixed(2)
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
        const quartzClient = await this.quartzClientPromise || QuartzClient.fetchClient(this.connection);    

        try {   
            const webflowClient = new WebflowClient({ accessToken: config.WEBFLOW_ACCESS_TOKEN });

            const usdcDepositRateBN = await quartzClient.getDepositRate(MARKET_INDEX_USDC);
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
