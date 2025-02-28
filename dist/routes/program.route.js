import { CompositeRoute } from "./compositeRoute.js";
import { BuildTxRoute } from "./program/buildTx.route.js";
import { ProgramDataRoute } from "./program/programData.route.js";
import { TxRoute } from "./program/tx.route.js";
export class ProgramRoute extends CompositeRoute {
    constructor() {
        super("/program", [
            new BuildTxRoute(),
            new ProgramDataRoute(),
            new TxRoute()
        ]);
    }
}
//# sourceMappingURL=program.route.js.map