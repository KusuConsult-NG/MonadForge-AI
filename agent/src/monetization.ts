import { createLogger, getConfig } from "@monadforge/sdk";
import { AgentSkills } from "@monadforge/skills";
import { AgentIdentity } from "./manifest";
import { ethers } from "ethers";

const logger = createLogger("Monetization");

export interface PaymentDetails {
  chargeId: string;
  txHash: string;
}

export interface PaymentAdapter {
  createCharge(skillName: string, amount: string, token: string): Promise<string>;
  verifyPayment(chargeId: string, txHash: string): Promise<boolean>;
  settleExecution(chargeId: string): Promise<void>;
}

export class MockPaymentAdapter implements PaymentAdapter {
  private charges = new Map<string, { skillName: string; amount: string; token: string; status: "pending" | "paid" | "settled" }>();

  public async createCharge(skillName: string, amount: string, token: string): Promise<string> {
    const chargeId = `ch_${Math.random().toString(36).substring(2, 15)}`;
    this.charges.set(chargeId, { skillName, amount, token, status: "pending" });
    logger.info(`Created charge ${chargeId} for skill ${skillName} (${amount} ${token})`);
    return chargeId;
  }

  public async verifyPayment(chargeId: string, txHash: string): Promise<boolean> {
    const charge = this.charges.get(chargeId);
    if (!charge) {
      throw new Error(`Charge not found: ${chargeId}`);
    }
    if (!txHash || !txHash.startsWith("0x") || txHash.length < 10) {
      logger.warn(`Verification failed for charge ${chargeId}: invalid transaction hash`);
      return false;
    }
    charge.status = "paid";
    logger.info(`Verified payment for charge ${chargeId} (txHash: ${txHash})`);
    return true;
  }

  public async settleExecution(chargeId: string): Promise<void> {
    const charge = this.charges.get(chargeId);
    if (!charge) {
      throw new Error(`Charge not found: ${chargeId}`);
    }
    if (charge.status !== "paid") {
      throw new Error(`Cannot settle unpaid charge: ${chargeId}`);
    }
    charge.status = "settled";
    logger.info(`Settled payment for charge ${chargeId}`);
  }

  public getChargeStatus(chargeId: string): string | undefined {
    return this.charges.get(chargeId)?.status;
  }
}

export class EthersPaymentAdapter implements PaymentAdapter {
  private charges = new Map<string, { skillName: string; amount: string; token: string; status: "pending" | "paid" | "settled" }>();
  private provider: ethers.JsonRpcProvider | null = null;

  constructor(provider?: ethers.JsonRpcProvider) {
    if (provider) {
      this.provider = provider;
    }
  }

  private getProvider(): ethers.JsonRpcProvider {
    if (this.provider) {
      return this.provider;
    }
    const config = getConfig();
    this.provider = new ethers.JsonRpcProvider(config.MONAD_RPC_URL);
    return this.provider;
  }

  private getReceiverAddress(): string {
    const config = getConfig();
    if (process.env.PAYMENT_RECEIVER_ADDRESS) {
      return process.env.PAYMENT_RECEIVER_ADDRESS;
    }
    if (config.DEPLOYER_PRIVATE_KEY && config.DEPLOYER_PRIVATE_KEY !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
      try {
        const wallet = new ethers.Wallet(config.DEPLOYER_PRIVATE_KEY);
        return wallet.address;
      } catch (err) {
        logger.error("Failed to derive receiver address from DEPLOYER_PRIVATE_KEY", err);
      }
    }
    return "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
  }

  public async createCharge(skillName: string, amount: string, token: string): Promise<string> {
    const chargeId = `ch_${Math.random().toString(36).substring(2, 15)}`;
    this.charges.set(chargeId, { skillName, amount, token, status: "pending" });
    logger.info(`Created Ethers charge ${chargeId} for skill ${skillName} (${amount} ${token})`);
    return chargeId;
  }

  public async verifyPayment(chargeId: string, txHash: string): Promise<boolean> {
    const charge = this.charges.get(chargeId);
    if (!charge) {
      throw new Error(`Charge not found: ${chargeId}`);
    }

    if (!txHash || !txHash.startsWith("0x")) {
      logger.warn(`Verification failed for charge ${chargeId}: invalid transaction hash`);
      return false;
    }

    try {
      const provider = this.getProvider();
      const tx = await provider.getTransaction(txHash);
      if (!tx) {
        logger.warn(`Transaction not found: ${txHash}`);
        return false;
      }

      const receipt = await provider.getTransactionReceipt(txHash);
      if (!receipt) {
        logger.warn(`Receipt not found for transaction: ${txHash}`);
        return false;
      }

      if (receipt.status !== 1) {
        logger.warn(`Transaction status is failed for: ${txHash}`);
        return false;
      }

      const receiver = this.getReceiverAddress().toLowerCase();
      const expectedAmountWei = ethers.parseEther(charge.amount);

      if (charge.token === "MON") {
        if (!tx.to || tx.to.toLowerCase() !== receiver) {
          logger.warn(`Transaction recipient does not match receiver. Expected: ${receiver}, Got: ${tx.to}`);
          return false;
        }

        if (tx.value < expectedAmountWei) {
          logger.warn(`Transaction value insufficient. Expected: ${expectedAmountWei}, Got: ${tx.value}`);
          return false;
        }
      } else {
        const transferTopic = ethers.id("Transfer(address,address,uint256)");
        let foundValidLog = false;

        for (const log of receipt.logs) {
          if (log.address.toLowerCase() !== charge.token.toLowerCase()) {
            continue;
          }

          if (log.topics[0] === transferTopic && log.topics.length >= 3) {
            const toAddress = ethers.getAddress("0x" + log.topics[2].slice(26));
            if (toAddress.toLowerCase() === receiver) {
              const value = ethers.toBigInt(log.data);
              if (value >= expectedAmountWei) {
                foundValidLog = true;
                break;
              }
            }
          }
        }

        if (!foundValidLog) {
          logger.warn(`No valid ERC-20 transfer event found matching token ${charge.token} and recipient ${receiver}`);
          return false;
        }
      }

      charge.status = "paid";
      logger.info(`Ethers payment verified for charge ${chargeId} via tx ${txHash}`);
      return true;
    } catch (err: any) {
      logger.error(`Error during on-chain verification for charge ${chargeId}`, err);
      try {
        const config = getConfig();
        const fallbackProvider = new ethers.JsonRpcProvider(config.MONAD_RPC_URL_FALLBACK);
        const tx = await fallbackProvider.getTransaction(txHash);
        const receipt = await fallbackProvider.getTransactionReceipt(txHash);
        if (tx && receipt && receipt.status === 1) {
          const receiver = this.getReceiverAddress().toLowerCase();
          const expectedAmountWei = ethers.parseEther(charge.amount);

          if (charge.token === "MON") {
            if (tx.to && tx.to.toLowerCase() === receiver && tx.value >= expectedAmountWei) {
              charge.status = "paid";
              logger.info(`Ethers payment verified via fallback RPC for charge ${chargeId}`);
              return true;
            }
          } else {
            const transferTopic = ethers.id("Transfer(address,address,uint256)");
            for (const log of receipt.logs) {
              if (log.address.toLowerCase() === charge.token.toLowerCase() && log.topics[0] === transferTopic && log.topics.length >= 3) {
                const toAddress = ethers.getAddress("0x" + log.topics[2].slice(26));
                if (toAddress.toLowerCase() === receiver) {
                  const value = ethers.toBigInt(log.data);
                  if (value >= expectedAmountWei) {
                    charge.status = "paid";
                    logger.info(`Ethers payment verified via fallback RPC for charge ${chargeId}`);
                    return true;
                  }
                }
              }
            }
          }
        }
      } catch (fallbackErr) {
        logger.error(`Fallback RPC verification also failed`, fallbackErr);
      }
      return false;
    }
  }

  public async settleExecution(chargeId: string): Promise<void> {
    const charge = this.charges.get(chargeId);
    if (!charge) {
      throw new Error(`Charge not found: ${chargeId}`);
    }
    if (charge.status !== "paid") {
      throw new Error(`Cannot settle unpaid charge: ${chargeId}`);
    }
    charge.status = "settled";
    logger.info(`Settled Ethers payment for charge ${chargeId}`);
  }

  public getChargeStatus(chargeId: string): string | undefined {
    return this.charges.get(chargeId)?.status;
  }
}

export class MonetizedExecutor {
  private skills = new AgentSkills();
  private paymentAdapter: PaymentAdapter;

  constructor(paymentAdapter: PaymentAdapter = new MockPaymentAdapter()) {
    this.paymentAdapter = paymentAdapter;
  }

  public async executeSkill(
    skillName: string,
    params: Record<string, any>,
    paymentDetails?: PaymentDetails,
    context?: any
  ): Promise<any> {
    const manifest = AgentIdentity.getManifest();
    const priceInfo = manifest.pricing?.[skillName];

    const requiresPayment = priceInfo && parseFloat(priceInfo.price) > 0;

    if (requiresPayment) {
      if (!paymentDetails) {
        throw new Error(`Execution of skill '${skillName}' requires payment of ${priceInfo.price} ${priceInfo.token}. No payment details provided.`);
      }

      const { chargeId, txHash } = paymentDetails;
      const isPaid = await this.paymentAdapter.verifyPayment(chargeId, txHash);
      if (!isPaid) {
        throw new Error(`Payment verification failed for charge '${chargeId}'`);
      }

      const result = await this.skills.route(skillName, params, context);

      await this.paymentAdapter.settleExecution(chargeId);

      return result;
    } else {
      return this.skills.route(skillName, params, context);
    }
  }
}
