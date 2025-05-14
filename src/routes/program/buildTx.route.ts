import { BuildTxController } from "../../controllers/program/buildTx.controller.js";
import { Route } from "../../types/route.class.js";

export class BuildTxRoute extends Route {
    protected declare controller: BuildTxController;

    constructor() {
        super("/build-tx", new BuildTxController());
    }

    protected initializeRoutes() {
        this.router.get("/adjust-spend-limit", this.controller.adjustSpendLimit);
        this.router.get("/init-account", this.controller.initAccount);
        this.router.get("/collateral-repay", this.controller.collateralRepay);
        this.router.get("/upgrade-account", this.controller.upgradeAccount);
        this.router.get("/withdraw", this.controller.withdraw);
        this.router.get("/cancel-withdraw", this.controller.cancelWithdraw);
        this.router.get("/fulfil-spend-limit", this.controller.fulfilSpendLimit);
    }
}