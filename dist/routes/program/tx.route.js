import { TxController } from "../../controllers/program/tx.controller.js";
import { Route } from "../../types/route.class.js";
export class TxRoute extends Route {
    constructor() {
        super("/tx", new TxController());
    }
    initializeRoutes() {
        this.router.get("/confirm", this.controller.confirmTx);
        this.router.post("/send", this.controller.sendTransaction);
    }
}
//# sourceMappingURL=tx.route.js.map