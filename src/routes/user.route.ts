import { Route } from "../types/route.class.js";
import { UserController } from "../controllers/user.controller.js";

export class UserRoute extends Route {
    protected declare controller: UserController;

    constructor() {
        super("/user", new UserController());
    }

    protected initializeRoutes() {
        this.router.get("/account-status", this.controller.getAccountStatus);
        
        this.router.get("/balance", this.controller.getBalance);
        this.router.get("/spendable-balance", this.controller.getSpendableBalance);
        this.router.get("/health", this.controller.getHealth);

        this.router.get("/withdraw-limit", this.controller.getWithdrawLimit);
        this.router.get("/borrow-limit", this.controller.getBorrowLimit);
        this.router.get("/deposit-limit", this.controller.getDepositLimits);
        this.router.get("/spend-limit", this.controller.getSpendLimits);
    }
}
