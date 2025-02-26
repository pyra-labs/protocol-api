import express from "express";
import config from "./config/config.js";
import cors from "cors";
import hpp from "hpp";
import helmet from "helmet";
import { ErrorMiddleware, HttpException } from "./utils/errors.js";
import type { Route } from "./types/route.class.js";
import { AppLogger } from "@quartz-labs/logger";
import type { CompositeRoute } from "./routes/compositeRoute.js";

export class App extends AppLogger {
    public app: express.Application;
    public port: number;
    public isListening = false;
    
    private routes: (Route | CompositeRoute)[];

    constructor(routes: (Route | CompositeRoute)[]) {
        super({
            name: "API App"
        });
        this.port = config.PORT;
        this.routes = routes;

        this.app = express();
        
        this.configureMiddleware();
        this.configureRoutes();
        this.configureErrorHandling();
    }

    private configureMiddleware() {
        this.app.use(cors({ origin: "*" }));
        this.app.use(hpp());
        this.app.use(helmet());
        this.app.use(express.json());
    }

    private configureRoutes() {
        this.app.get("/", (_, res) => {
            res.status(200).send({result: "ok"});
        })

        for (const route of this.routes) {
            route.initLogger(this.logger, this.sendEmail);
            this.app.use(route.path, route.router);
        }

        this.app.all("*", () => {
            throw new HttpException(404, "Endpoint not found");
        });
    }

    private configureErrorHandling() {
        const errorMiddleware = new ErrorMiddleware(this.logger);
        this.app.use(errorMiddleware.handle);
    }

    public async listen() {
        if (this.isListening) {
            this.logger.warn("App is already listening");
            return;
        }

        await new Promise((resolve) => this.app.listen(this.port, () => {
            this.isListening = true;
            this.logger.info(`App listening on port ${this.port}`);
            resolve(true);
        }));
    }
}