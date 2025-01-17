import { App } from "./src/app.ts";
import { DataRoute } from "./src/routes/data.routes";
import { UserRoute } from "./src/routes/user.routes";

export default () => {
      const app = new App([
            new DataRoute(),
            new UserRoute(),
      ]);
      app.listen();
};
