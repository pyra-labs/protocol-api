import { Router } from "express";
import { Routes } from "../interfaces/routes.interface";
import { DataController } from "../controllers/data.controller";

export class DataRoute implements Routes {
    public path = "/data";
    public router = Router();
    private dataController = new DataController();

    constructor() {
        this.initializeRoutes();
    }

    private initializeRoutes() {
        this.router.get(`/price`, this.dataController.getPrice);
    }
}
