import { CardDetailsController } from "../../controllers/program/cardDetails.controller.js";
import { Route } from "../../types/route.class.js";

export class CardDetailsRoute extends Route {
    protected declare controller: CardDetailsController;

    constructor() {
        super("/card-details", new CardDetailsController());
    }

    protected initializeRoutes() {
        this.router.post("/", this.controller.getCardDetails);
    }
}