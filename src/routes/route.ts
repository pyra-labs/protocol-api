import type { Logger } from "@quartz-labs/logger";
import { Router } from "express";
import type { Controller } from "../controllers/controller.js";

export abstract class Route {
    public router = Router();
    public path: string;
    protected controller: Controller;

    constructor(path: string, controller: Controller) {
        this.path = path;
        this.controller = controller;
        this.initializeRoutes();
    }

    public initLogger(
        logger: Logger,
        sendWarningEmail: (subject: string, message: string) => void
    ) {
        this.controller.setLogger(logger, sendWarningEmail);
    }

    protected abstract initializeRoutes(): void;
}
