import { DriftClient, Wallet } from "@drift-labs/sdk";
import { Connection, Keypair } from "@solana/web3.js";
import config from "../config/config.js";
import { SUPPORTED_DRIFT_MARKETS } from "../config/constants.js";

export class DriftClientService {
    private static instance: DriftClientService;
    private driftClient: DriftClient;
    private driftClientInitPromise: Promise<boolean>;

    constructor() {
        const connection = new Connection(config.RPC_URL);
        const wallet = new Wallet(Keypair.generate());

        this.driftClient = new DriftClient({
            connection: connection,
            wallet: wallet,
            env: 'mainnet-beta',
            userStats: false,
            perpMarketIndexes: [],
            spotMarketIndexes: SUPPORTED_DRIFT_MARKETS,
            accountSubscription: {
                type: 'websocket',
                commitment: "confirmed"
            }
        });
        this.driftClientInitPromise = this.driftClient.subscribe();
    }

    public static async getDriftClient(): Promise<DriftClient> {
        if (!DriftClientService.instance) {
            DriftClientService.instance = new DriftClientService();
        }
        await DriftClientService.instance.driftClientInitPromise;
        return DriftClientService.instance.driftClient;
    }
}
