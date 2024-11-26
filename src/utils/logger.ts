import { Writable } from "stream";
import winston, { createLogger, Logger, transports } from "winston";
import nodemailer from "nodemailer";

export class AppLogger {
    protected logger: Logger;

    constructor(name: string) {
        const mailTransporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: parseInt(process.env.EMAIL_PORT!),
            secure: false,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD,
            },
        });

        const mailTransportInstance = new winston.transports.Stream({
            stream: new Writable({
                write: (message: string) => {
                    const admins = process.env.EMAIL_TO!.split(',');
                    for (const admin of admins) {
                        mailTransporter.sendMail({
                            from: process.env.EMAIL_FROM,
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