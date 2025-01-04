import config from "../config/config.js";
import type { NextFunction, Request, Response } from "express";
import { Connection, PublicKey, SystemProgram, type TransactionInstruction } from "@solana/web3.js";
import { HttpException } from "../utils/errors.js";
import { QuartzClient, type QuartzUser, MarketIndex, Wallet, TOKENS } from "@quartz-labs/sdk";
import { Keypair } from "@solana/web3.js";
import { getConfig as getMarginfiConfig, MarginfiClient } from "@mrgnlabs/marginfi-client-v2";
import { baseUnitToDecimal, buildTransaction, getJupiterSwapQuote, getTokenAccountBalance, getWsolMint, makeCreateAtaIxsIfNeeded } from "../utils/helpers.js";
import { createCloseAccountInstruction } from "@mrgnlabs/mrgn-common";
import { createSyncNativeInstruction } from "@mrgnlabs/mrgn-common";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { JUPITER_SLIPPAGE_BPS } from "../config/constants.js";

export class BuildTransactionController {
    private quartzClientPromise: Promise<QuartzClient>;
    private connection: Connection;

    constructor() {
        this.connection = new Connection(config.RPC_URL);
        this.quartzClientPromise = QuartzClient.fetchClient(this.connection);
    }

    private validateAddress(address: string): PublicKey {
        try {
            const pubkey = new PublicKey(address);
            return pubkey;
        } catch {
            throw new HttpException(400, "Invalid address");
        }
    }

    private async getQuartzUser(pubkey: PublicKey): Promise<QuartzUser> {
        try {
            const quartzClient = await this.quartzClientPromise;
            return quartzClient.getQuartzAccount(pubkey);
        } catch {
            throw new HttpException(400, "Quartz account not found");
        }
    }

    private validateMarketIndex(marketIndexParam: string) {
        if (!marketIndexParam) {
            throw new HttpException(400, "Market index is required");
        }
        
        const marketIndex = Number(marketIndexParam);
        if (Number.isNaN(marketIndex) || marketIndex < 0) {
            throw new HttpException(400, "Invalid market index");
        }

        if (!MarketIndex.includes(marketIndex as any)) {
            throw new HttpException(400, "Unsupported market index");
        }

        return marketIndex as MarketIndex;
    }

    private validateAmountBaseUnits(amountBaseUnitsParam: string) {
        const amountBaseUnits = Number(amountBaseUnitsParam);
        if (Number.isNaN(amountBaseUnits) || amountBaseUnits < 0 || !Number.isInteger(amountBaseUnits)) {
            throw new HttpException(400, "Invalid amount base units");
        }
        return amountBaseUnits;
    }

    public initAccount = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const quartzClient = await this.quartzClientPromise;

            const { address: addressParam } = req.body;
            const address = this.validateAddress(addressParam);

            const wallet = new Wallet(Keypair.generate());
            const marginfiClient = await MarginfiClient.fetch(getMarginfiConfig(), wallet, this.connection);

            const [ixs_initAccount, marginfiAccounts] = await Promise.all([
                quartzClient.makeInitQuartzUserIxs(address),
                marginfiClient.getMarginfiAccountsForAuthority(address)
            ]);

            const newMarginfiKeypair = Keypair.generate();
            const oix_initMarginfiAccount: TransactionInstruction[] = [];
            if (marginfiAccounts.length === 0) {
                const ix_createMarginfiAccount = await marginfiClient.makeCreateMarginfiAccountIx(newMarginfiKeypair.publicKey);
                oix_initMarginfiAccount.push(...ix_createMarginfiAccount.instructions);
            } else if (marginfiAccounts[0]?.isDisabled) {
                throw new Error("Flash loan MarginFi account is bankrupt"); // TODO: Handle disabled MarginFi accounts
            }

            const instructions = [...ixs_initAccount, ...oix_initMarginfiAccount];
            const transaction = await buildTransaction(this.connection, instructions, address);
            if (oix_initMarginfiAccount.length > 0) transaction.sign([newMarginfiKeypair]);

            const serializedTransaction = Buffer.from(transaction.serialize()).toString('base64');
            res.status(200).json({ transaction: serializedTransaction });
        } catch (error) {
            next(error);
        }
    }

    public closeAccount = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { address: addressParam } = req.body;
            const address = this.validateAddress(addressParam);

            const user = await this.getQuartzUser(address);
            const instructions = await user.makeCloseAccountIxs();
            const transaction = await buildTransaction(this.connection, instructions, address);

            const serializedTransaction = Buffer.from(transaction.serialize()).toString('base64');
            res.status(200).json({ transaction: serializedTransaction });
        } catch (error) {
            next(error);
        }
    } 

    public deposit = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { 
                address: addressParam, 
                amountBaseUnits: amountBaseUnitsParam, 
                marketIndex: marketIndexParam 
            } = req.body;

            const address = this.validateAddress(addressParam);
            const amountBaseUnits = this.validateAmountBaseUnits(amountBaseUnitsParam);
            const marketIndex = this.validateMarketIndex(marketIndexParam);

            const user = await this.getQuartzUser(address);

            const mint = TOKENS[marketIndex].mint;
            const walletAta = await getAssociatedTokenAddress(mint, address);
            const oix_createAta = await makeCreateAtaIxsIfNeeded(this.connection, walletAta, address, mint);

            const oix_wrapSol: TransactionInstruction[] = [];
            const oix_closeWsol: TransactionInstruction[] = [];
            if (mint === getWsolMint()) {
                const ix_wrapSol = SystemProgram.transfer({
                    fromPubkey: address,
                    toPubkey: walletAta,
                    lamports: amountBaseUnits,
                });
                const ix_syncNative = createSyncNativeInstruction(walletAta);
                oix_wrapSol.push(ix_wrapSol, ix_syncNative);
                oix_closeWsol.push(createCloseAccountInstruction(walletAta, address, address));
            }

            const ix_deposit = await user.makeDepositIx(amountBaseUnits, mint, marketIndex, false);
            const instructions = [...oix_createAta, ...oix_wrapSol, ix_deposit, ...oix_closeWsol];
            const transaction = await buildTransaction(this.connection, instructions, address);

            const serializedTransaction = Buffer.from(transaction.serialize()).toString('base64');
            res.status(200).json({ transaction: serializedTransaction });
        } catch (error) {
            next(error);
        }
    }

    public withdraw = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { 
                address: addressParam, 
                amountBaseUnits: amountBaseUnitsParam, 
                marketIndex: marketIndexParam 
            } = req.body;

            const address = this.validateAddress(addressParam);
            const amountBaseUnits = this.validateAmountBaseUnits(amountBaseUnitsParam);
            const marketIndex = this.validateMarketIndex(marketIndexParam);

            const user = await this.getQuartzUser(address);

            const mint = TOKENS[marketIndex].mint;
            const walletAta = await getAssociatedTokenAddress(mint, address);
            const oix_createAta = await makeCreateAtaIxsIfNeeded(this.connection, walletAta, address, mint);

            const oix_closeWsol: TransactionInstruction[] = [];
            if (mint === getWsolMint()) {
                oix_closeWsol.push(createCloseAccountInstruction(walletAta, address, address));
            }

            const ix_withdraw = await user.makeWithdrawIx(amountBaseUnits, mint, marketIndex, false);
            const instructions = [...oix_createAta, ix_withdraw, ...oix_closeWsol];
            const transaction = await buildTransaction(this.connection, instructions, address);

            const serializedTransaction = Buffer.from(transaction.serialize()).toString('base64');
            res.status(200).json({ transaction: serializedTransaction });
        } catch (error) {
            next(error);
        }
    }

    public collateralRepay = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { 
                address: addressParam, 
                amountLoanBaseUnits: amountLoanBaseUnitsParam, 
                marketIndexLoan: marketIndexLoanParam,
                marketIndexCollateral: marketIndexCollateralParam
            } = req.body;

            const address = this.validateAddress(addressParam);
            const amountLoanBaseUnits = this.validateAmountBaseUnits(amountLoanBaseUnitsParam);
            const marketIndexLoan = this.validateMarketIndex(marketIndexLoanParam);
            const marketIndexCollateral = this.validateMarketIndex(marketIndexCollateralParam);

            const user = await this.getQuartzUser(address);

            // Build instructions
            const mintCollateral = TOKENS[marketIndexCollateral].mint;
            const walletAtaCollateral = await getAssociatedTokenAddress(mintCollateral, address);
            const startingBalanceCollateral = await getTokenAccountBalance(this.connection, walletAtaCollateral);

            const mintLoan = TOKENS[marketIndexLoan].mint;
            const walletAtaLoan = await getAssociatedTokenAddress(mintLoan, address);
            const oix_createAtaLoan = await makeCreateAtaIxsIfNeeded(this.connection, walletAtaLoan, address, mintLoan);

            const jupiterQuote = await getJupiterSwapQuote(mintCollateral, mintLoan, amountLoanBaseUnits, JUPITER_SLIPPAGE_BPS);
            const collateralRequiredForSwap = Number(jupiterQuote.inAmount) * (1 + (JUPITER_SLIPPAGE_BPS / 10_000));

            const { ixs: ixs_collateralRepay, lookupTables } = await user.makeCollateralRepayIxs(
                address,
                walletAtaLoan,
                mintLoan,
                marketIndexLoan,
                walletAtaCollateral,
                mintCollateral,
                marketIndexCollateral,
                startingBalanceCollateral + collateralRequiredForSwap,
                jupiterQuote
            );
            const instructions = [...oix_createAtaLoan, ...ixs_collateralRepay];

            // Build flash loan transaction
            const PRIORITY_FEE_DECIMAL = 0.0025;
            const amountLoanDecimal = baseUnitToDecimal(collateralRequiredForSwap, marketIndexLoan);

            const wallet = new Wallet(Keypair.generate());
            const marginfiClient = await MarginfiClient.fetch(getMarginfiConfig(), wallet, this.connection);
            const [ marginfiAccount ] = await marginfiClient.getMarginfiAccountsForAuthority(address);
            if (marginfiAccount === undefined) throw new Error("Could not find Flash Loan MarginFi account");
            if (marginfiAccount.isDisabled) throw new Error("Flash Loan MarginFi account is disabled"); // TODO: Handle disabled MarginFi accounts

            const loanBank = marginfiClient.getBankByMint(mintLoan);
            if (loanBank === null) throw new Error("Could not find Flash Loan MarginFi bank");

            const { flashloanTx: transaction } = await marginfiAccount.makeLoopTx(
                amountLoanDecimal,
                amountLoanDecimal,
                loanBank.address,
                loanBank.address,
                instructions,
                lookupTables,
                PRIORITY_FEE_DECIMAL,
                true
            );

            const serializedTransaction = Buffer.from(transaction.serialize()).toString('base64');
            res.status(200).json({ transaction: serializedTransaction });
        } catch (error) {
            next(error);
        }
    }
}
