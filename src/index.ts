import { App } from "./app.js";
import { DataRoute } from "./routes/data.route.js";
import { UserRoute } from "./routes/user.route.js";

const app = new App([
  new DataRoute(),
  new UserRoute(),
]);
app.listen();
