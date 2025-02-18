import type { Logger } from "@quartz-labs/logger";

export abstract class Controller {
    private logger: Logger | undefined;
    private sendEmailMethod: ((subject: string, message: string) => void) | undefined;

    public setLogger(
        logger: Logger,
        sendEmail: (subject: string, message: string) => void
    ) {
        this.logger = logger;
        this.sendEmailMethod = sendEmail;
    }

    protected getLogger() {
        if (!this.logger) {
            throw new Error("Logger not set");
        }

        return this.logger;
    }

    protected sendEmail(subject: string, message: string) {
        if (!this.sendEmailMethod) {
            throw new Error("Send email not set");
        }

        this.sendEmailMethod(subject, message);
    }
}
