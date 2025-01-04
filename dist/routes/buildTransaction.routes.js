"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BuildTransactionRoute = void 0;
const express_1 = require("express");
const buildTransaction_controller_js_1 = require("../controllers/buildTransaction.controller.js");
class BuildTransactionRoute {
    path = "/build-transaction";
    router = (0, express_1.Router)();
    transactionController = new buildTransaction_controller_js_1.BuildTransactionController();
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
exports.BuildTransactionRoute = BuildTransactionRoute;
//# sourceMappingURL=buildTransaction.routes.js.map