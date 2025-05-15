import { TxController } from "../../controllers/program/tx.controller.js";
import { Route } from "../../types/route.class.js";

export class TxRoute extends Route {
    protected declare controller: TxController;

    constructor() {
        super("/tx", new TxController());
    }

    protected initializeRoutes() {
        this.router.get("/confirm", this.controller.confirmTx);
        this.router.post("/send", this.controller.sendTransaction);
        this.router.get("/is-user-paying-order-rent", this.controller.isUserPayingOrderRent);
    }
}