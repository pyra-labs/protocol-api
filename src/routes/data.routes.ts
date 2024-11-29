import { Router } from "express";
import { Routes } from "../interfaces/routes.interface.js";
import { DataController } from "../controllers/data.controller.js";

export class DataRoute implements Routes {
    public path = "/data";
    public router = Router();
    private dataController = new DataController();

    constructor() {
        this.initializeRoutes();
    }

    private initializeRoutes() {
        this.router.get(`/price`, this.dataController.getPrice);
        this.router.get(`/users`, this.dataController.getUsers);
        this.router.get(`/tvl`, this.dataController.getTVL);
    }
}
