import { Router } from "express";
import type { Routes } from "../interfaces/routes.interface.js";
import { BuildTransactionController } from "../controllers/buildTransaction.controller.js";

export class BuildTransactionRoute implements Routes {
    public path = "/build-transaction";
    public router = Router();
    private transactionController = new BuildTransactionController();

    constructor() {
        this.initializeRoutes();
    }

    private initializeRoutes() {
        this.router.get("/init-account", this.transactionController.initAccount);
        this.router.get("/close-account", this.transactionController.closeAccount);
        this.router.get("/deposit", this.transactionController.deposit);
        this.router.get("/withdraw", this.transactionController.withdraw);
        this.router.get("/collateral-repay", this.transactionController.collateralRepay);
    }
}
