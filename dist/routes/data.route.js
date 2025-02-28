import { Route } from "../types/route.class.js";
import { DataController } from "../controllers/data.controller.js";
export class DataRoute extends Route {
    constructor() {
        super("/data", new DataController());
    }
    initializeRoutes() {
        this.router.get("/price", this.controller.getPrice);
        this.router.get("/users", this.controller.getUsers);
        this.router.get("/tvl", this.controller.getTVL);
        this.router.post("/waitlist", this.controller.addWaitlist);
        this.router.put("/update-website-data", this.controller.updateWebsiteData);
    }
}
//# sourceMappingURL=data.route.js.map