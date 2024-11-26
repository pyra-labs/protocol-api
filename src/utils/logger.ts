import { Writable } from "stream";
import winston, { createLogger, Logger, transports } from "winston";
import nodemailer from "nodemailer";
import config from "../config/config";

export class AppLogger {
    protected logger: Logger;

    constructor(name: string) {
        const mailTransporter = nodemailer.createTransport({
            host: config.EMAIL_HOST,
            port: config.EMAIL_PORT!,
            secure: false,
            auth: {
                user: config.EMAIL_USER,
                pass: config.EMAIL_PASSWORD,
            },
        });

        const mailTransportInstance = new winston.transports.Stream({
            stream: new Writable({
                write: (message: string) => {
                    for (const admin of config.EMAIL_TO) {
                        mailTransporter.sendMail({
                            from: config.EMAIL_FROM,
                            to: admin,
                            subject: `${name} Error`,
                            text: message,
                        });
                    }
                    return true;
                }
            }),
            level: 'error',
            format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
        });

        this.logger = createLogger({
            level: 'info',
            format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
            transports: [
                new transports.Console(),
                mailTransportInstance
            ],
            exceptionHandlers: [
                new transports.Console(),
                mailTransportInstance
            ],
            rejectionHandlers: [
                new transports.Console(),
                mailTransportInstance
            ],
        });
    }
}