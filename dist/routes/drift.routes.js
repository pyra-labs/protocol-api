"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DriftRoute = void 0;
const express_1 = require("express");
const drift_controller_js_1 = require("../controllers/drift.controller.js");
class DriftRoute {
    path = "/drift";
    router = (0, express_1.Router)();
    driftController = new drift_controller_js_1.DriftController();
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
exports.DriftRoute = DriftRoute;
//# sourceMappingURL=drift.routes.js.map