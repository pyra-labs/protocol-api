import type { NextFunction, Request, Response } from "express";
import config from "../config/config.js";
import { baseUnitToDecimal, delay, MARKET_INDEX_USDC, type MarketIndex, QuartzClient, retryWithBackoff } from "@quartz-labs/sdk";
import { Controller } from "../types/controller.class.js";
import { PriceFetcherService } from "../services/priceFetcher.service.js";
import AdvancedConnection from "@quartz-labs/connection";

export class DataController extends Controller {
    private quartzClientPromise: Promise<QuartzClient>;
    private priceFetcher: PriceFetcherService;
    private connection: AdvancedConnection;

    constructor() {
        super();
        this.connection = new AdvancedConnection(config.RPC_URLS);
        this.quartzClientPromise = QuartzClient.fetchClient({connection: this.connection});
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
        const quartzClient = await this.quartzClientPromise;    

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
            const quartzClient = await this.quartzClientPromise;   

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
}
