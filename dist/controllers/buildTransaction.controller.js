"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BuildTransactionController = void 0;
const config_js_1 = __importDefault(require("../config/config.js"));
const web3_js_1 = require("@solana/web3.js");
const errors_js_1 = require("../utils/errors.js");
const sdk_1 = require("@quartz-labs/sdk");
const web3_js_2 = require("@solana/web3.js");
const marginfi_client_v2_1 = require("@mrgnlabs/marginfi-client-v2");
const helpers_js_1 = require("../utils/helpers.js");
const mrgn_common_1 = require("@mrgnlabs/mrgn-common");
const mrgn_common_2 = require("@mrgnlabs/mrgn-common");
const spl_token_1 = require("@solana/spl-token");
const constants_js_1 = require("../config/constants.js");
class BuildTransactionController {
    quartzClientPromise;
    connection;
    constructor() {
        this.connection = new web3_js_1.Connection(config_js_1.default.RPC_URL);
        this.quartzClientPromise = sdk_1.QuartzClient.fetchClient(this.connection);
    }
    validateAddress(address) {
        try {
            const pubkey = new web3_js_1.PublicKey(address);
            return pubkey;
        }
        catch {
            throw new errors_js_1.HttpException(400, "Invalid address");
        }
    }
    async getQuartzUser(pubkey) {
        try {
            const quartzClient = await this.quartzClientPromise;
            return quartzClient.getQuartzAccount(pubkey);
        }
        catch {
            throw new errors_js_1.HttpException(400, "Quartz account not found");
        }
    }
    validateMarketIndex(marketIndexParam) {
        if (!marketIndexParam) {
            throw new errors_js_1.HttpException(400, "Market index is required");
        }
        const marketIndex = Number(marketIndexParam);
        if (Number.isNaN(marketIndex) || marketIndex < 0) {
            throw new errors_js_1.HttpException(400, "Invalid market index");
        }
        if (!sdk_1.MarketIndex.includes(marketIndex)) {
            throw new errors_js_1.HttpException(400, "Unsupported market index");
        }
        return marketIndex;
    }
    validateAmountBaseUnits(amountBaseUnitsParam) {
        const amountBaseUnits = Number(amountBaseUnitsParam);
        if (Number.isNaN(amountBaseUnits) || amountBaseUnits < 0 || !Number.isInteger(amountBaseUnits)) {
            throw new errors_js_1.HttpException(400, "Invalid amount base units");
        }
        return amountBaseUnits;
    }
    initAccount = async (req, res, next) => {
        try {
            const quartzClient = await this.quartzClientPromise;
            const { address: addressParam } = req.body;
            const address = this.validateAddress(addressParam);
            const wallet = new sdk_1.Wallet(web3_js_2.Keypair.generate());
            const marginfiClient = await marginfi_client_v2_1.MarginfiClient.fetch((0, marginfi_client_v2_1.getConfig)(), wallet, this.connection);
            const [ixs_initAccount, marginfiAccounts] = await Promise.all([
                quartzClient.makeInitQuartzUserIxs(address),
                marginfiClient.getMarginfiAccountsForAuthority(address)
            ]);
            const newMarginfiKeypair = web3_js_2.Keypair.generate();
            const oix_initMarginfiAccount = [];
            if (marginfiAccounts.length === 0) {
                const ix_createMarginfiAccount = await marginfiClient.makeCreateMarginfiAccountIx(newMarginfiKeypair.publicKey);
                oix_initMarginfiAccount.push(...ix_createMarginfiAccount.instructions);
            }
            else if (marginfiAccounts[0]?.isDisabled) {
                throw new Error("Flash loan MarginFi account is bankrupt"); // TODO: Handle disabled MarginFi accounts
            }
            const instructions = [...ixs_initAccount, ...oix_initMarginfiAccount];
            const transaction = await (0, helpers_js_1.buildTransaction)(this.connection, instructions, address);
            if (oix_initMarginfiAccount.length > 0)
                transaction.sign([newMarginfiKeypair]);
            const serializedTransaction = Buffer.from(transaction.serialize()).toString('base64');
            res.status(200).json({ transaction: serializedTransaction });
        }
        catch (error) {
            next(error);
        }
    };
    closeAccount = async (req, res, next) => {
        try {
            const { address: addressParam } = req.body;
            const address = this.validateAddress(addressParam);
            const user = await this.getQuartzUser(address);
            const instructions = await user.makeCloseAccountIxs();
            const transaction = await (0, helpers_js_1.buildTransaction)(this.connection, instructions, address);
            const serializedTransaction = Buffer.from(transaction.serialize()).toString('base64');
            res.status(200).json({ transaction: serializedTransaction });
        }
        catch (error) {
            next(error);
        }
    };
    deposit = async (req, res, next) => {
        try {
            const { address: addressParam, amountBaseUnits: amountBaseUnitsParam, marketIndex: marketIndexParam } = req.body;
            const address = this.validateAddress(addressParam);
            const amountBaseUnits = this.validateAmountBaseUnits(amountBaseUnitsParam);
            const marketIndex = this.validateMarketIndex(marketIndexParam);
            const user = await this.getQuartzUser(address);
            const mint = sdk_1.TOKENS[marketIndex].mint;
            const walletAta = await (0, spl_token_1.getAssociatedTokenAddress)(mint, address);
            const oix_createAta = await (0, helpers_js_1.makeCreateAtaIxsIfNeeded)(this.connection, walletAta, address, mint);
            const oix_wrapSol = [];
            const oix_closeWsol = [];
            if (mint === (0, helpers_js_1.getWsolMint)()) {
                const ix_wrapSol = web3_js_1.SystemProgram.transfer({
                    fromPubkey: address,
                    toPubkey: walletAta,
                    lamports: amountBaseUnits,
                });
                const ix_syncNative = (0, mrgn_common_2.createSyncNativeInstruction)(walletAta);
                oix_wrapSol.push(ix_wrapSol, ix_syncNative);
                oix_closeWsol.push((0, mrgn_common_1.createCloseAccountInstruction)(walletAta, address, address));
            }
            const ix_deposit = await user.makeDepositIx(amountBaseUnits, mint, marketIndex, false);
            const instructions = [...oix_createAta, ...oix_wrapSol, ix_deposit, ...oix_closeWsol];
            const transaction = await (0, helpers_js_1.buildTransaction)(this.connection, instructions, address);
            const serializedTransaction = Buffer.from(transaction.serialize()).toString('base64');
            res.status(200).json({ transaction: serializedTransaction });
        }
        catch (error) {
            next(error);
        }
    };
    withdraw = async (req, res, next) => {
        try {
            const { address: addressParam, amountBaseUnits: amountBaseUnitsParam, marketIndex: marketIndexParam } = req.body;
            const address = this.validateAddress(addressParam);
            const amountBaseUnits = this.validateAmountBaseUnits(amountBaseUnitsParam);
            const marketIndex = this.validateMarketIndex(marketIndexParam);
            const user = await this.getQuartzUser(address);
            const mint = sdk_1.TOKENS[marketIndex].mint;
            const walletAta = await (0, spl_token_1.getAssociatedTokenAddress)(mint, address);
            const oix_createAta = await (0, helpers_js_1.makeCreateAtaIxsIfNeeded)(this.connection, walletAta, address, mint);
            const oix_closeWsol = [];
            if (mint === (0, helpers_js_1.getWsolMint)()) {
                oix_closeWsol.push((0, mrgn_common_1.createCloseAccountInstruction)(walletAta, address, address));
            }
            const ix_withdraw = await user.makeWithdrawIx(amountBaseUnits, mint, marketIndex, false);
            const instructions = [...oix_createAta, ix_withdraw, ...oix_closeWsol];
            const transaction = await (0, helpers_js_1.buildTransaction)(this.connection, instructions, address);
            const serializedTransaction = Buffer.from(transaction.serialize()).toString('base64');
            res.status(200).json({ transaction: serializedTransaction });
        }
        catch (error) {
            next(error);
        }
    };
    collateralRepay = async (req, res, next) => {
        try {
            const { address: addressParam, amountLoanBaseUnits: amountLoanBaseUnitsParam, marketIndexLoan: marketIndexLoanParam, marketIndexCollateral: marketIndexCollateralParam } = req.body;
            const address = this.validateAddress(addressParam);
            const amountLoanBaseUnits = this.validateAmountBaseUnits(amountLoanBaseUnitsParam);
            const marketIndexLoan = this.validateMarketIndex(marketIndexLoanParam);
            const marketIndexCollateral = this.validateMarketIndex(marketIndexCollateralParam);
            const user = await this.getQuartzUser(address);
            // Build instructions
            const mintCollateral = sdk_1.TOKENS[marketIndexCollateral].mint;
            const walletAtaCollateral = await (0, spl_token_1.getAssociatedTokenAddress)(mintCollateral, address);
            const startingBalanceCollateral = await (0, helpers_js_1.getTokenAccountBalance)(this.connection, walletAtaCollateral);
            const mintLoan = sdk_1.TOKENS[marketIndexLoan].mint;
            const walletAtaLoan = await (0, spl_token_1.getAssociatedTokenAddress)(mintLoan, address);
            const oix_createAtaLoan = await (0, helpers_js_1.makeCreateAtaIxsIfNeeded)(this.connection, walletAtaLoan, address, mintLoan);
            const jupiterQuote = await (0, helpers_js_1.getJupiterSwapQuote)(mintCollateral, mintLoan, amountLoanBaseUnits, constants_js_1.JUPITER_SLIPPAGE_BPS);
            const collateralRequiredForSwap = Number(jupiterQuote.inAmount) * (1 + (constants_js_1.JUPITER_SLIPPAGE_BPS / 10_000));
            const { ixs: ixs_collateralRepay, lookupTables } = await user.makeCollateralRepayIxs(address, walletAtaLoan, mintLoan, marketIndexLoan, walletAtaCollateral, mintCollateral, marketIndexCollateral, startingBalanceCollateral + collateralRequiredForSwap, jupiterQuote);
            const instructions = [...oix_createAtaLoan, ...ixs_collateralRepay];
            // Build flash loan transaction
            const PRIORITY_FEE_DECIMAL = 0.0025;
            const amountLoanDecimal = (0, helpers_js_1.baseUnitToDecimal)(collateralRequiredForSwap, marketIndexLoan);
            const wallet = new sdk_1.Wallet(web3_js_2.Keypair.generate());
            const marginfiClient = await marginfi_client_v2_1.MarginfiClient.fetch((0, marginfi_client_v2_1.getConfig)(), wallet, this.connection);
            const [marginfiAccount] = await marginfiClient.getMarginfiAccountsForAuthority(address);
            if (marginfiAccount === undefined)
                throw new Error("Could not find Flash Loan MarginFi account");
            if (marginfiAccount.isDisabled)
                throw new Error("Flash Loan MarginFi account is disabled"); // TODO: Handle disabled MarginFi accounts
            const loanBank = marginfiClient.getBankByMint(mintLoan);
            if (loanBank === null)
                throw new Error("Could not find Flash Loan MarginFi bank");
            const { flashloanTx: transaction } = await marginfiAccount.makeLoopTx(amountLoanDecimal, amountLoanDecimal, loanBank.address, loanBank.address, instructions, lookupTables, PRIORITY_FEE_DECIMAL, true);
            const serializedTransaction = Buffer.from(transaction.serialize()).toString('base64');
            res.status(200).json({ transaction: serializedTransaction });
        }
        catch (error) {
            next(error);
        }
    };
}
exports.BuildTransactionController = BuildTransactionController;
//# sourceMappingURL=buildTransaction.controller.js.map