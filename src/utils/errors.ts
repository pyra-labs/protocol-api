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
            
            this.logger.error(`[${req.method}] ${req.path} >> StatusCode:: ${status}, Message:: ${message}`);

            res.status(status).json({ message });
        } catch (error) {
            next(error);
        }
    }
}