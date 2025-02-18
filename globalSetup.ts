import { App } from "./src/app.ts";
import { DataRoute } from "./src/routes/data.route";
import { UserRoute } from "./src/routes/user.route";

export default async () => {
      const app = new App([
            new DataRoute(),
            new UserRoute(),
      ]);
      await app.listen();
};
