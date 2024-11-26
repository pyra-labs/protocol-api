import { App } from "./app";
import { DataRoute } from "./routes/data.routes";
import { DriftRoute } from "./routes/drift.routes";

const app = new App([
  new DataRoute(),
  new DriftRoute()
]);
app.listen();