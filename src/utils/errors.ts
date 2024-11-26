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
    constructor(private logger: Logger) {}

    handle(error: HttpException, req: Request, res: Response, next: NextFunction) {
        try {
            const status: number = error.status || 500;
            this.logger.error(`[${req.method}] ${req.path} >> StatusCode:: ${status}, Message:: ${error.message}`);

            res.status(status).json({ message: error.message });
        } catch (error) {
            next(error);
        }
    }
}