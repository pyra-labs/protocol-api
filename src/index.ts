import { App } from "./app.js";
import { DataRoute } from "./routes/data.route.js";
import { UserRoute } from "./routes/user.route.js";
import { ProgramRoute } from "./routes/program.route.js";
import { QuartzClient } from "@quartz-labs/sdk";
import config from "./config/config.js";
import { Connection } from "@solana/web3.js";

const app = new App([
  new DataRoute(),
  new UserRoute(),
  new ProgramRoute()
]);
app.listen();
