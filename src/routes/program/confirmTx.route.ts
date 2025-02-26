import { ConfirmTxController } from "../../controllers/program/confirmTx.controller.js";
import { Route } from "../../types/route.class.js";

export class ConfirmTxRoute extends Route {
    protected declare controller: ConfirmTxController;

    constructor() {
        super("/confirm-tx", new ConfirmTxController());
    }

    protected initializeRoutes() {
        this.router.get("/", this.controller.confirmTx);
    }
}