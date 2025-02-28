import { App } from "./app.js";
import { DataRoute } from "./routes/data.route.js";
import { UserRoute } from "./routes/user.route.js";
import { ProgramRoute } from "./routes/program.route.js";
const app = new App([
    new DataRoute(),
    new UserRoute(),
    new ProgramRoute()
]);
app.listen();
//# sourceMappingURL=index.js.map