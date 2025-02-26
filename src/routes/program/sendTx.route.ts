import { SendTxController } from "../../controllers/program/sendTx.controller.js";
import { Route } from "../../types/route.class.js";

export class SendTxRoute extends Route {
    protected declare controller: SendTxController;

    constructor() {
        super("/send-tx", new SendTxController());
    }

    protected initializeRoutes() {
        this.router.post("/", this.controller.sendTransaction);
    }
}