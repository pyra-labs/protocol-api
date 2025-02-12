import type { Logger } from "@quartz-labs/logger";

export abstract class Controller {
    private logger: Logger | undefined;
    private sendWarningEmailMethod: ((subject: string, message: string) => void) | undefined;

    public setLogger(
        logger: Logger,
        sendWarningEmail: (subject: string, message: string) => void
    ) {
        this.logger = logger;
        this.sendWarningEmailMethod = sendWarningEmail;
    }

    protected getLogger() {
        if (!this.logger) {
            throw new Error("Logger not set");
        }

        return this.logger;
    }

    protected sendWarningEmail(subject: string, message: string) {
        if (!this.sendWarningEmailMethod) {
            throw new Error("Send warning email not set");
        }

        this.sendWarningEmailMethod(subject, message);
    }
}
