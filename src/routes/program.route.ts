import { AccountStatusRoute } from "./program/accountStatus.route.js";
import { CompositeRoute } from "./compositeRoute.js";
import { SendTxRoute } from "./program/sendTx.route.js";
import { BuildTxRoute } from "./program/buildTx.route.js";

export class ProgramRoute extends CompositeRoute {
    constructor() {
        super(
            "/program",
            [
                new AccountStatusRoute(),
                new SendTxRoute(),
                new BuildTxRoute(),
            ]
        );
    }
}
