import type { Logger } from "@quartz-labs/logger";
import { Router } from "express";
import type { Controller } from "./controller.class.js";

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
        sendEmail: (subject: string, message: string) => void
    ) {
        this.controller.setLogger(logger, sendEmail);
    }

    protected abstract initializeRoutes(): void;
}
