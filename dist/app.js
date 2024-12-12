import express from "express";
import config from "./config/config.js";
import cors from "cors";
import hpp from "hpp";
import { AppLogger } from "./utils/logger.js";
import helmet from "helmet";
import { ErrorMiddleware, HttpException } from "./utils/errors.js";
export class App extends AppLogger {
    app;
    port;
    isListening = false;
    routes;
    constructor(routes) {
        super("API App");
        this.port = config.PORT;
        this.routes = routes;
        this.app = express();
        this.configureMiddleware();
        this.configureRoutes();
        this.configureErrorHandling();
    }
    configureMiddleware() {
        this.app.use(cors({ origin: "*" }));
        this.app.use(hpp());
        this.app.use(helmet());
        this.app.use(express.json());
    }
    configureRoutes() {
        this.app.get("/", (_, res) => {
            res.status(200).send({ result: "ok" });
        });
        for (const route of this.routes) {
            this.app.use(route.path, route.router);
        }
        this.app.all("*", () => {
            throw new HttpException(404, "Endpoint not found");
        });
    }
    configureErrorHandling() {
        const errorMiddleware = new ErrorMiddleware(this.logger);
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
//# sourceMappingURL=app.js.map