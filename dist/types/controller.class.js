export class Controller {
    logger;
    sendEmailMethod;
    setLogger(logger, sendEmail) {
        this.logger = logger;
        this.sendEmailMethod = sendEmail;
    }
    getLogger() {
        if (!this.logger) {
            throw new Error("Logger not set");
        }
        return this.logger;
    }
    sendEmail(subject, message) {
        if (!this.sendEmailMethod) {
            throw new Error("Send email not set");
        }
        this.sendEmailMethod(subject, message);
    }
}
//# sourceMappingURL=controller.class.js.map