"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.App = void 0;
const express_1 = __importDefault(require("express"));
const config_js_1 = __importDefault(require("./config/config.js"));
const cors_1 = __importDefault(require("cors"));
const hpp_1 = __importDefault(require("hpp"));
const logger_js_1 = require("./utils/logger.js");
const helmet_1 = __importDefault(require("helmet"));
const errors_js_1 = require("./utils/errors.js");
class App extends logger_js_1.AppLogger {
    app;
    port;
    isListening = false;
    routes;
    constructor(routes) {
        super("API App");
        this.port = config_js_1.default.PORT;
        this.routes = routes;
        this.app = (0, express_1.default)();
        this.configureMiddleware();
        this.configureRoutes();
        this.configureErrorHandling();
    }
    configureMiddleware() {
        this.app.use((0, cors_1.default)({ origin: "*" }));
        this.app.use((0, hpp_1.default)());
        this.app.use((0, helmet_1.default)());
        this.app.use(express_1.default.json());
    }
    configureRoutes() {
        this.app.get("/", (_, res) => {
            res.status(200).send({ result: "ok" });
        });
        for (const route of this.routes) {
            this.app.use(route.path, route.router);
        }
        this.app.all("*", () => {
            throw new errors_js_1.HttpException(404, "Endpoint not found");
        });
    }
    configureErrorHandling() {
        const errorMiddleware = new errors_js_1.ErrorMiddleware(this.logger);
        this.app.use(errorMiddleware.handle);
    }
    async listen() {
        if (this.isListening) {
            this.logger.warn("App is already listening");
            return;
        }
        this.app.listen(this.port, () => {
            this.isListening = true;
            this.logger.info(`App listening on port ${this.port}`);
        });
    }
}
exports.App = App;
//# sourceMappingURL=app.js.map