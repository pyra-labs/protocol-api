import { App } from "./app.js";
import { DataRoute } from "./routes/data.routes.js";
import { UserRoute } from "./routes/user.routes.js";

const app = new App([
  new DataRoute(),
  new UserRoute(),
]);
app.listen();
