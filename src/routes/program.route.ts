import { CompositeRoute } from "./compositeRoute.js";
import { BuildTxRoute } from "./program/buildTx.route.js";
import { ProgramDataRoute } from "./program/programData.route.js";

export class ProgramRoute extends CompositeRoute {
    constructor() {
        super(
            "/program",
            [
                new BuildTxRoute(),
                new ProgramDataRoute(),
            ]
        );
    }
}
