"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataRoute = void 0;
const express_1 = require("express");
const data_controller_js_1 = require("../controllers/data.controller.js");
class DataRoute {
    path = "/data";
    router = (0, express_1.Router)();
    dataController = new data_controller_js_1.DataController();
    constructor() {
        this.initializeRoutes();
    }
    initializeRoutes() {
        this.router.get("/price", this.dataController.getPrice);
        this.router.get("/users", this.dataController.getUsers);
        this.router.get("/tvl", this.dataController.getTVL);
        this.router.post("/waitlist", this.dataController.addWaitlist);
        this.router.put("/update-website-data", this.dataController.updateWebsiteData);
    }
}
exports.DataRoute = DataRoute;
//# sourceMappingURL=data.routes.js.map