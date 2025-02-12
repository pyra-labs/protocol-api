import { Routes } from "./routes.js";
import { UserController } from "../controllers/user.controller.js";

export class UserRoute extends Routes {
    protected declare controller: UserController;

    constructor() {
        super("/user", new UserController());
    }

    protected initializeRoutes() {
        this.router.get("/rate", this.controller.getRate);
        this.router.get("/balance", this.controller.getBalance);
        this.router.get("/withdraw-limit", this.controller.getWithdrawLimit);
        this.router.get("/health", this.controller.getHealth);
    }
}
