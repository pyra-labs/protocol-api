"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppLogger = void 0;
const node_stream_1 = require("node:stream");
const winston_1 = __importStar(require("winston"));
const nodemailer_1 = __importDefault(require("nodemailer"));
const config_js_1 = __importDefault(require("../config/config.js"));
class AppLogger {
    logger;
    constructor(name) {
        const consoleFormat = winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.printf(({ level, message, timestamp }) => {
            return `[${timestamp}] ${level}: ${message}`;
        }));
        const mailFormat = winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.json({ space: 2 }));
        const mailTransporter = nodemailer_1.default.createTransport({
            host: config_js_1.default.EMAIL_HOST,
            port: config_js_1.default.EMAIL_PORT,
            secure: false,
            auth: {
                user: config_js_1.default.EMAIL_USER,
                pass: config_js_1.default.EMAIL_PASSWORD,
            },
        });
        const mailTransportInstance = new winston_1.default.transports.Stream({
            stream: new node_stream_1.Writable({
                write: (message) => {
                    for (const admin of config_js_1.default.EMAIL_TO) {
                        mailTransporter.sendMail({
                            from: config_js_1.default.EMAIL_FROM,
                            to: admin,
                            subject: `${name} Error`,
                            text: message,
                        });
                    }
                    return true;
                }
            }),
            level: 'error',
            format: mailFormat,
        });
        this.logger = (0, winston_1.createLogger)({
            level: 'info',
            transports: [
                new winston_1.transports.Console({ format: consoleFormat }),
                mailTransportInstance
            ],
            exceptionHandlers: [
                new winston_1.transports.Console({ format: consoleFormat }),
                mailTransportInstance
            ],
            rejectionHandlers: [
                new winston_1.transports.Console({ format: consoleFormat }),
                mailTransportInstance
            ],
        });
        process.on("uncaughtException", (error) => {
            this.logger.error(error.message);
        });
        process.on("unhandledRejection", (reason) => {
            this.logger.error(reason);
        });
    }
}
exports.AppLogger = AppLogger;
//# sourceMappingURL=logger.js.map