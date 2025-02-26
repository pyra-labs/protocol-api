import type { Logger } from "@quartz-labs/logger";
import { Router } from "express";
import { Route } from "../types/route.class.js";

export class CompositeRoute {
    public router = Router();
    public path: string;
    private routes: Route[];

    constructor(path: string, routes: Route[]) {
        this.path = path;
        this.routes = routes;
        this.initializeRoutes();
    }

    private initializeRoutes() {
        for (const route of this.routes) {
            this.router.use(route.path, route.router);
        }
    }

    public initLogger(
        logger: Logger,
        sendWarningEmail: (subject: string, message: string) => void
    ) {
        for (const route of this.routes) {
            route.initLogger(logger, sendWarningEmail);
        }
    }
}