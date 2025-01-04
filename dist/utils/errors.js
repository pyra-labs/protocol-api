"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorMiddleware = exports.HttpException = void 0;
class HttpException extends Error {
    status;
    message;
    constructor(status, message) {
        super(message);
        this.status = status;
        this.message = message;
    }
}
exports.HttpException = HttpException;
class ErrorMiddleware {
    logger;
    constructor(logger) {
        this.logger = logger;
        this.handle = this.handle.bind(this);
    }
    handle(error, req, res, next) {
        try {
            const status = error instanceof HttpException ? error.status : 500;
            const message = error.message || 'Something went wrong';
            const queryString = Object.keys(req.query).length ? `?${new URLSearchParams(req.query).toString()}` : '';
            const fullPath = `${req.path}${queryString}`;
            if (status >= 500) {
                this.logger.error(`[${req.method}] ${fullPath} >> StatusCode:: ${status}, Message:: ${message}`);
            }
            else {
                this.logger.warn(`[${req.method}] ${fullPath} >> StatusCode:: ${status}, Message:: ${message}`);
            }
            res.status(status).json({ message });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.ErrorMiddleware = ErrorMiddleware;
//# sourceMappingURL=errors.js.map