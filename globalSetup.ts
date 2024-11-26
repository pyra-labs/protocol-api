import { App } from "./src/app";
import { DataRoute } from "./src/routes/data.routes";
import { DriftRoute } from "./src/routes/drift.routes";

// globalSetup.ts

export default () => {
      const app = new App([
            new DataRoute(),
            new DriftRoute(),
      ]);
      app.listen();
};
