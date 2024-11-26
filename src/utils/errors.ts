import { NextFunction, Request, Response } from "express";
import { Logger } from "winston";

export class HttpException extends Error {
    public status: number;
    public message: string;

    constructor(status: number, message: string) {
          super(message);
          this.status = status;
          this.message = message;
    }
}


export class ErrorMiddleware {
    constructor(private logger: Logger) {
        this.handle = this.handle.bind(this);
    }

    handle(error: Error | HttpException, req: Request, res: Response, next: NextFunction) {
        try {
            const status: number = error instanceof HttpException ? error.status : 500;
            const message: string = error.message || 'Something went wrong';
            
            const queryString = Object.keys(req.query).length ? `?${new URLSearchParams(req.query as Record<string, string>).toString()}` : '';
            const fullPath = `${req.path}${queryString}`;

            if (status >= 500) {
                this.logger.error(`[${req.method}] ${fullPath} >> StatusCode:: ${status}, Message:: ${message}`);
            } else {
                this.logger.warn(`[${req.method}] ${fullPath} >> StatusCode:: ${status}, Message:: ${message}`);
            }

            res.status(status).json({ message });
        } catch (error) {
            next(error);
        }
    }
}