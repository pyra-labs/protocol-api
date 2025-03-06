import { BuildTxController } from "../../controllers/program/buildTx.controller.js";
import { Route } from "../../types/route.class.js";
export class BuildTxRoute extends Route {
    constructor() {
        super("/build-tx", new BuildTxController());
    }
    initializeRoutes() {
        this.router.get("/spend-limit", this.controller.adjustSpendLimit);
        this.router.get("/init-account", this.controller.initAccount);
        this.router.get("/close-account", this.controller.closeAccount);
        this.router.get("/collateral-repay", this.controller.collateralRepay);
        this.router.get("/deposit", this.controller.deposit);
        this.router.get("/upgrade-account", this.controller.upgradeAccount);
    }
}
//# sourceMappingURL=buildTx.route.js.map