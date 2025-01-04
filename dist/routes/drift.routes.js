import { Router } from "express";
import { DriftController } from "../controllers/drift.controller.js";
export class DriftRoute {
    path = "/drift";
    router = Router();
    driftController = new DriftController();
    constructor() {
        this.initializeRoutes();
    }
    initializeRoutes() {
        this.router.get("/rate", this.driftController.getRate);
        this.router.get("/balance", this.driftController.getBalance);
        this.router.get("/withdraw-limit", this.driftController.getWithdrawLimit);
        this.router.get("/health", this.driftController.getHealth);
    }
}
//# sourceMappingURL=drift.routes.js.map