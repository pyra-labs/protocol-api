import { Router } from "express";
import type { Routes } from "../interfaces/routes.interface.js";
import { DriftController } from "../controllers/drift.controller.js";

export class DriftRoute implements Routes {
    public path = "/drift";
    public router = Router();
    private driftController = new DriftController();

    constructor() {
        this.initializeRoutes();
    }

    private initializeRoutes() {
        this.router.get("/rate", this.driftController.getRate);
        this.router.get("/balance", this.driftController.getBalance);
        this.router.get("/withdraw-limit", this.driftController.getWithdrawLimit);
        this.router.get("/health", this.driftController.getHealth);
    }
}
