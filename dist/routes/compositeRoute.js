import { Router } from "express";
import { Route } from "../types/route.class.js";
export class CompositeRoute {
    router = Router();
    path;
    routes;
    constructor(path, routes) {
        this.path = path;
        this.routes = routes;
        this.initializeRoutes();
    }
    initializeRoutes() {
        for (const route of this.routes) {
            this.router.use(route.path, route.router);
        }
    }
    initLogger(logger, sendWarningEmail) {
        for (const route of this.routes) {
            route.initLogger(logger, sendWarningEmail);
        }
    }
}
//# sourceMappingURL=compositeRoute.js.map