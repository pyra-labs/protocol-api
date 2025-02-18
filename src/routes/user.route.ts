import { Route } from "../types/route.class.js";
import { UserController } from "../controllers/user.controller.js";

export class UserRoute extends Route {
    protected declare controller: UserController;

    constructor() {
        super("/user", new UserController());
    }

    protected initializeRoutes() {
        this.router.get("/rate", this.controller.getRate);
        this.router.get("/balance", this.controller.getBalance);
        this.router.get("/withdraw-limit", this.controller.getWithdrawLimit);
        this.router.get("/health", this.controller.getHealth);
        this.router.get("/spendable-balance", this.controller.getSpendableBalance);
    }
}
