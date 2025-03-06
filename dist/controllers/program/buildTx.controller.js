import { Connection, PublicKey } from '@solana/web3.js';
import { HttpException } from '../../utils/errors.js';
import { buildAdjustSpendLimitTransaction } from './build-tx/adjustSpendLimit.js';
import { Controller } from '../../types/controller.class.js';
import { QuartzClient } from '@quartz-labs/sdk';
import { SwapMode } from '@jup-ag/api';
import config from '../../config/config.js';
import { buildDepositTransaction } from './build-tx/deposit.js';
import { buildInitAccountTransaction } from './build-tx/initAccount.js';
import { buildUpgradeAccountTransaction } from './build-tx/upgradeAccount.js';
import { buildWithdrawTransaction } from './build-tx/withdraw.js';
import { buildCollateralRepayTransaction } from './build-tx/collateralRepay.js';
import { buildCloseAccountTransaction } from './build-tx/closeAccount.js';
export class BuildTxController extends Controller {
    connection;
    quartzClientPromise;
    constructor() {
        super();
        this.connection = new Connection(config.RPC_URL);
        this.quartzClientPromise = QuartzClient.fetchClient(this.connection);
    }
    adjustSpendLimit = async (req, res, next) => {
        try {
            const quartzClient = await this.quartzClientPromise;
            const address = new PublicKey(req.query.address);
            if (!address) {
                throw new HttpException(400, "Wallet address is required");
            }
            const spendLimitTransactionBaseUnits = Number(req.query.spendLimitTransactionBaseUnits);
            if (!spendLimitTransactionBaseUnits) {
                throw new HttpException(400, "Spend limit transaction base units is required");
            }
            const spendLimitTimeframeBaseUnits = Number(req.query.spendLimitTimeframeBaseUnits);
            if (!spendLimitTimeframeBaseUnits) {
                throw new HttpException(400, "Spend limit timeframe base units is required");
            }
            let spendLimitTimeframe = Number(req.query.spendLimitTimeframe);
            if (!spendLimitTimeframe) {
                throw new HttpException(400, "Spend limit timeframe is required");
            }
            const serializedTx = await buildAdjustSpendLimitTransaction(address, spendLimitTransactionBaseUnits, spendLimitTimeframeBaseUnits, spendLimitTimeframe, this.connection, quartzClient);
            res.status(200).json({ transaction: serializedTx });
            return;
        }
        catch (error) {
            this.getLogger().error(`Error building adjust spend limit transaction: ${error}`);
            next(error);
        }
    };
    async initAccount(req, res, next) {
        try {
            const address = new PublicKey(req.query.address);
            if (!address) {
                throw new HttpException(400, "Wallet address is required");
            }
            const quartzClient = await this.quartzClientPromise;
            const serializedTx = await buildInitAccountTransaction(address, this.connection, quartzClient);
            res.status(200).json({ transaction: serializedTx });
            return;
        }
        catch (error) {
            this.getLogger().error(`Error building init account transaction: ${error}`);
            next(error);
        }
    }
    async closeAccount(req, res, next) {
        try {
            const quartzClient = await this.quartzClientPromise;
            const address = new PublicKey(req.query.address);
            if (!address) {
                throw new HttpException(400, "Wallet address is required");
            }
            const serializedTx = await buildCloseAccountTransaction(address, this.connection, quartzClient);
            res.status(200).json({ transaction: serializedTx });
            return;
        }
        catch (error) {
            this.getLogger().error(`Error building close account transaction: ${error}`);
            next(error);
        }
    }
    async collateralRepay(req, res, next) {
        try {
            const quartzClient = await this.quartzClientPromise;
            const address = new PublicKey(req.query.address);
            if (!address) {
                throw new HttpException(400, "Wallet address is required");
            }
            const amountSwapBaseUnits = Number(req.query.amountSwapBaseUnits);
            if (!amountSwapBaseUnits) {
                throw new HttpException(400, "Amount swap base units is required");
            }
            const marketIndexLoan = Number(req.query.marketIndexLoan);
            if (!marketIndexLoan) {
                throw new HttpException(400, "Market index loan is required");
            }
            const marketIndexCollateral = Number(req.query.marketIndexCollateral);
            if (!marketIndexCollateral) {
                throw new HttpException(400, "Market index collateral is required");
            }
            const swapMode = req.query.swapMode;
            if (!swapMode) {
                throw new HttpException(400, "Swap mode is required");
            }
            const useMaxAmount = req.query.useMaxAmount === "true";
            if (!useMaxAmount) {
                throw new HttpException(400, "Use max amount is required");
            }
            const serializedTx = await buildCollateralRepayTransaction(address, amountSwapBaseUnits, marketIndexLoan, marketIndexCollateral, swapMode, useMaxAmount, this.connection, config.FLASH_LOAN_CALLER, quartzClient);
            res.status(200).json({ transaction: serializedTx });
            return;
        }
        catch (error) {
            this.getLogger().error(`Error building collateral repay transaction: ${error}`);
            next(error);
        }
    }
    async deposit(req, res, next) {
        try {
            const address = new PublicKey(req.query.address);
            if (!address) {
                throw new HttpException(400, "Wallet address is required");
            }
            const amountBaseUnits = Number(req.query.amountBaseUnits);
            if (!amountBaseUnits) {
                throw new HttpException(400, "Amount base units is required");
            }
            const marketIndex = Number(req.query.marketIndex);
            if (!marketIndex) {
                throw new HttpException(400, "Market index is required");
            }
            const repayingLoan = req.query.repayingLoan === "true";
            if (!repayingLoan) {
                throw new HttpException(400, "Repaying loan is required");
            }
            const useMaxAmount = req.query.useMaxAmount === "true";
            if (!useMaxAmount) {
                throw new HttpException(400, "Use max amount is required");
            }
            const quartzClient = await this.quartzClientPromise;
            const serializedTx = await buildDepositTransaction(address, amountBaseUnits, marketIndex, repayingLoan, useMaxAmount, this.connection, quartzClient);
            res.status(200).json({ transaction: serializedTx });
            return;
        }
        catch (error) {
            this.getLogger().error(`Error building deposit transaction: ${error}`);
            next(error);
        }
    }
    async upgradeAccount(req, res, next) {
        try {
            const address = new PublicKey(req.query.address);
            if (!address) {
                throw new HttpException(400, "Wallet address is required");
            }
            const quartzClient = await this.quartzClientPromise;
            const serializedTx = await buildUpgradeAccountTransaction(address, this.connection, quartzClient);
            res.status(200).json({ transaction: serializedTx });
            return;
        }
        catch (error) {
            this.getLogger().error(`Error building upgrade account transaction: ${error}`);
            next(error);
        }
    }
    async withdraw(req, res, next) {
        try {
            const address = new PublicKey(req.query.address);
            if (!address) {
                throw new HttpException(400, "Wallet address is required");
            }
            const amountBaseUnits = Number(req.query.amountBaseUnits);
            if (!amountBaseUnits) {
                throw new HttpException(400, "Amount base units is required");
            }
            const marketIndex = Number(req.query.marketIndex);
            if (!marketIndex) {
                throw new HttpException(400, "Market index is required");
            }
            const allowLoan = req.query.allowLoan === "true";
            if (!allowLoan) {
                throw new HttpException(400, "Allow loan is required");
            }
            const useMaxAmount = req.query.useMaxAmount === "true";
            if (!useMaxAmount) {
                throw new HttpException(400, "Use max amount is required");
            }
            const quartzClient = await this.quartzClientPromise;
            const serializedTx = await buildWithdrawTransaction(address, amountBaseUnits, marketIndex, allowLoan, useMaxAmount, this.connection, quartzClient);
            res.status(200).json({ transaction: serializedTx });
            return;
        }
        catch (error) {
            this.getLogger().error(`Error building withdraw transaction: ${error}`);
            next(error);
        }
    }
}
//# sourceMappingURL=buildTx.controller.js.map