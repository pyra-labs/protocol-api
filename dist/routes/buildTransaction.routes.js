import { Router } from "express";
import { BuildTransactionController } from "../controllers/buildTransaction.controller.js";
export class BuildTransactionRoute {
    path = "/build-transaction";
    router = Router();
    transactionController = new BuildTransactionController();
    constructor() {
        this.initializeRoutes();
    }
    initializeRoutes() {
        this.router.get("/init-account", this.transactionController.initAccount);
        this.router.get("/close-account", this.transactionController.closeAccount);
        this.router.get("/deposit", this.transactionController.deposit);
        this.router.get("/withdraw", this.transactionController.withdraw);
        this.router.get("/collateral-repay", this.transactionController.collateralRepay);
    }
}
//# sourceMappingURL=buildTransaction.routes.js.map