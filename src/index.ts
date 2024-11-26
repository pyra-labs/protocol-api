import { App } from "./app.js";
import { DataRoute } from "./routes/data.routes.js";
import { DriftRoute } from "./routes/drift.routes.js";

const app = new App([
  new DataRoute(),
  new DriftRoute()
]);
app.listen();