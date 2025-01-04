"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRoute = void 0;
const express_1 = require("express");
const drift_controller_js_1 = require("../controllers/drift.controller.js");
class UserRoute {
    path = "/user";
    router = (0, express_1.Router)();
    userController = new drift_controller_js_1.DriftController();
    constructor() {
        this.initializeRoutes();
    }
    initializeRoutes() {
        this.router.get("/rate", this.userController.getRate);
        this.router.get("/balance", this.userController.getBalance);
        this.router.get("/withdraw-limit", this.userController.getWithdrawLimit);
        this.router.get("/health", this.userController.getHealth);
    }
}
exports.UserRoute = UserRoute;
//# sourceMappingURL=user.routes.js.map