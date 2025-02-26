import { AccountStatusController } from "../../controllers/program/accountStatus.controller.js";
import { Route } from "../../types/route.class.js";

export class AccountStatusRoute extends Route {
    protected declare controller: AccountStatusController;

    constructor() {
        super("/account-status", new AccountStatusController());
    }

    protected initializeRoutes() {
        this.router.get("/", this.controller.getAccountStatus);
    }
}