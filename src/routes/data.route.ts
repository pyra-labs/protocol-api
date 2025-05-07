import { Route } from "../types/route.class.js";
import { DataController } from "../controllers/data.controller.js";

export class DataRoute extends Route {
    protected declare controller: DataController;

    constructor() {
        super("/data", new DataController());
    }

    protected initializeRoutes() {
        this.router.get("/price", this.controller.getPrice);
        this.router.get("/users", this.controller.getUsers);
        this.router.get("/tvl", this.controller.getTVL);
    }
}
