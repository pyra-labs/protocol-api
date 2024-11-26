import { NextFunction, Request, Response } from "express";

export class DataController {
    public getPrice = async (req: Request, res: Response, next: NextFunction) => {
        const ids = req.query.ids as string;
        
        try {
            const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
            const data = await response.json();

            const pricesUsd = Object.keys(data).reduce((acc, id) => {
                acc[id] = data[id].usd;
                return acc;
            }, {} as Record<string, number>);

            res.status(200).json(pricesUsd);
        } catch (error) {
            next(error);
        }
    }
}