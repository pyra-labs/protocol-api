import { AccountStatusRoute } from "./program/accountStatus.route.js";
import { CompositeRoute } from "./compositeRoute.js";
import { SendTxRoute } from "./program/sendTx.route.js";
import { BuildTxRoute } from "./program/buildTx.route.js";
import { ConfirmTxRoute } from "./program/confirmTx.route.js";

export class ProgramRoute extends CompositeRoute {
    constructor() {
        super(
            "/program",
            [
                new AccountStatusRoute(),
                new SendTxRoute(),
                new BuildTxRoute(),
                new ConfirmTxRoute(),
            ]
        );
    }
}
