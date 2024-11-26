import { Router } from "express";
import { Routes } from "../interfaces/routes.interface";
import { DriftController } from "../controllers/drift.controller";

export class DriftRoute implements Routes {
    public path = "/drift";
    public router = Router();
    private driftController = new DriftController();

    constructor() {
        this.initializeRoutes();
    }

    private initializeRoutes() {
        this.router.get(`${this.path}/rate`, this.driftController.getRate);
        this.router.get(`${this.path}/balance`, this.driftController.getBalance);
        this.router.get(`${this.path}/withdraw-limit`, this.driftController.getWithdrawLimit);
        this.router.get(`${this.path}/health`, this.driftController.getHealth);
    }
}
