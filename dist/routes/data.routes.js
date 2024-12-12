import { Router } from "express";
import { DataController } from "../controllers/data.controller.js";
export class DataRoute {
    path = "/data";
    router = Router();
    dataController = new DataController();
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
//# sourceMappingURL=data.routes.js.map