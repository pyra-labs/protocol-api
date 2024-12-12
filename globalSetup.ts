import { App } from "./src/app.ts";
import { DataRoute } from "./src/routes/data.routes";
import { DriftRoute } from "./src/routes/drift.routes";

export default () => {
      const app = new App([
            new DataRoute(),
            new DriftRoute(),
      ]);
      app.listen();
};
