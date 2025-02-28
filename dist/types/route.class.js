import { Router } from "express";
export class Route {
    router = Router();
    path;
    controller;
    constructor(path, controller) {
        this.path = path;
        this.controller = controller;
        this.initializeRoutes();
    }
    initLogger(logger, sendEmail) {
        this.controller.setLogger(logger, sendEmail);
    }
}
//# sourceMappingURL=route.class.js.map