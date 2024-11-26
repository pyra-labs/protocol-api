import { NextFunction, Request, Response } from "express";

export class DataController {
    public getPrice = async (req: Request, res: Response, next: NextFunction) => {
        const asset = req.query.asset as string;

        try {
            const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${asset}&vs_currencies=usd`);
            const data = await response.json();
            const priceUsdc = data[asset].usd;
            res.status(200).json({ usd: priceUsdc });
        } catch (error) {
            next(error);
        }
    }
}