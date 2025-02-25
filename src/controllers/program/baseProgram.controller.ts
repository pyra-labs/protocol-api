import config from "../../config/config.js";
import { Controller } from "../../types/controller.class.js";
import { Connection } from "@solana/web3.js";
import { QuartzClient } from '@quartz-labs/sdk';

export class BaseProgramController extends Controller {
    protected connection: Connection = new Connection(config.RPC_URL);
    protected quartzClientPromise: Promise<QuartzClient>;

    constructor() {
        super();
        this.quartzClientPromise = QuartzClient.fetchClient(this.connection);
    }
}