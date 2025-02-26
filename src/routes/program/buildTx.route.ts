import { BuildTxController } from "../../controllers/program/buildTx.controller.js";
import { Route } from "../../types/route.class.js";

export class BuildTxRoute extends Route {
    protected declare controller: BuildTxController;

    constructor() {
        super("/build-tx", new BuildTxController());
    }

    protected initializeRoutes() {
        this.router.get("/spend-limit", this.controller.buildSpendLimitTx);
        this.router.get("/init-account", this.controller.initAccount);
    }
}