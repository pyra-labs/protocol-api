import express from "express";
import config from "./config/config";
import cors from "cors";
import hpp from "hpp";
import { AppLogger } from "./utils/logger";
import helmet from "helmet";
import { ErrorMiddleware, HttpException } from "./utils/errors";
import { Routes } from "./interfaces/routes.interface";

export class App extends AppLogger {
    public app: express.Application;
    public port: number;
    public isListening: boolean = false;
    
    private routes: Routes[];

    constructor(routes: Routes[]) {
        super("API App");
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
        this.app.get("/", (req, res) => {
            res.status(200).send({result: "ok"});
        })

        this.routes.forEach(route => {
            this.app.use(route.path, route.router);
        });

        this.app.all("*", (req, res) => {
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

        this.app.listen(this.port, () => {
            this.isListening = true;
            this.logger.info(`App listening on port ${this.port}`);
        });
    }
}