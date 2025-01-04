import { Router } from "express";
import type { Routes } from "../interfaces/routes.interface.js";
import { DriftController } from "../controllers/drift.controller.js";

export class UserRoute implements Routes {
    public path = "/user";
    public router = Router();
    private userController = new DriftController();

    constructor() {
        this.initializeRoutes();
    }

    private initializeRoutes() {
        this.router.get("/rate", this.userController.getRate);
        this.router.get("/balance", this.userController.getBalance);
        this.router.get("/withdraw-limit", this.userController.getWithdrawLimit);
        this.router.get("/health", this.userController.getHealth);
    }
}
