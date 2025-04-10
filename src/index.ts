import { App } from "./app.js";
import { DataRoute } from "./routes/data.route.js";
import { UserRoute } from "./routes/user.route.js";
import { ProgramRoute } from "./routes/program.route.js";
import config from "./config/config.js";

const app = new App(
  [
    new DataRoute(),
    new UserRoute(),
    new ProgramRoute()
  ],
  config.ROUTE_PREFIX
);
app.listen();
