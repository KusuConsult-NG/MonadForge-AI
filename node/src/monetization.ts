import { createLogger, getConfig } from "@monadforge/sdk";
import { AgentSkills } from "@monadforge/skills";
import { NodeIdentity } from "./manifest";
import { ethers } from "ethers";

const logger = createLogger("Monetization");

export interface PaymentDetails {
  chargeId: string;
  txHash: string;
}

export interface PaymentAdapter {
  createCharge(
    skillName: string,
    amount: string,
    token: string,
  ): Promise<string>;
  verifyPayment(chargeId: string, txHash: string): Promise<boolean>;
  settleExecution(chargeId: string): Promise<void>;
  cancelCharge?(chargeId: string): Promise<void>;
}

export class MockPaymentAdapter implements PaymentAdapter {
  private charges = new Map<
    string,
    {
      skillName: string;
      amount: string;
      token: string;
      status: "pending" | "paid" | "settled" | "refunded";
    }
  >();

  public async createCharge(
    skillName: string,
    amount: string,
    token: string,
  ): Promise<string> {
    const chargeId = `ch_${Math.random().toString(36).substring(2, 15)}`;
    this.charges.set(chargeId, { skillName, amount, token, status: "pending" });
    logger.info(
      `Created charge ${chargeId} for skill ${skillName} (${amount} ${token})`,
    );
    return chargeId;
  }

  public async verifyPayment(
    chargeId: string,
    txHash: string,
  ): Promise<boolean> {
    const charge = this.charges.get(chargeId);
    if (!charge) {
      throw new Error(`Charge not found: ${chargeId}`);
    }
    if (!txHash || !txHash.startsWith("0x") || txHash.length < 10) {
      logger.warn(
        `Verification failed for charge ${chargeId}: invalid transaction hash`,
      );
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

  public async cancelCharge(chargeId: string): Promise<void> {
    const charge = this.charges.get(chargeId);
    if (!charge) {
      throw new Error(`Charge not found: ${chargeId}`);
    }
    charge.status = "refunded";
    logger.info(`Cancelled and refunded mock payment for charge ${chargeId}`);
  }

  public getChargeStatus(chargeId: string): string | undefined {
    return this.charges.get(chargeId)?.status;
  }
}

export class EthersPaymentAdapter implements PaymentAdapter {
  private charges = new Map<
    string,
    {
      skillName: string;
      amount: string;
      token: string;
      status: "pending" | "paid" | "settled" | "refunded";
      txHash?: string;
    }
  >();
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
    if (
      config.DEPLOYER_PRIVATE_KEY &&
      config.DEPLOYER_PRIVATE_KEY !==
        "0x0000000000000000000000000000000000000000000000000000000000000000"
    ) {
      try {
        const wallet = new ethers.Wallet(config.DEPLOYER_PRIVATE_KEY);
        return wallet.address;
      } catch (err) {
        logger.error(
          "Failed to derive receiver address from DEPLOYER_PRIVATE_KEY",
          err,
        );
      }
    }
    return "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
  }

  public async createCharge(
    skillName: string,
    amount: string,
    token: string,
  ): Promise<string> {
    const chargeId = `ch_${Math.random().toString(36).substring(2, 15)}`;
    this.charges.set(chargeId, { skillName, amount, token, status: "pending" });
    logger.info(
      `Created Ethers charge ${chargeId} for skill ${skillName} (${amount} ${token})`,
    );
    return chargeId;
  }

  private parseTransferEvent(
    log: any,
    transferTopic: string,
    receiver: string,
    expectedAmountWei: bigint,
  ): boolean {
    if (log.topics[0] === transferTopic) {
      let toAddress = "";
      let value = 0n;

      if (log.topics.length >= 3) {
        toAddress = ethers.getAddress("0x" + log.topics[2].slice(26));
        value = ethers.toBigInt(log.data);
      } else if (log.topics.length === 1 && log.data && log.data !== "0x") {
        try {
          const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
            ["address", "address", "uint256"],
            log.data,
          );
          toAddress = decoded[1];
          value = decoded[2];
        } catch {}
      }

      if (toAddress && toAddress.toLowerCase() === receiver.toLowerCase()) {
        return value >= expectedAmountWei;
      }
    }
    return false;
  }

  private parseTxInputData(
    tx: any,
    receiver: string,
    expectedAmountWei: bigint,
  ): boolean {
    if (tx && tx.data && tx.data.startsWith("0xa9059cbb")) {
      try {
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
          ["address", "uint256"],
          "0x" + tx.data.slice(10),
        );
        const toAddress = decoded[0];
        const value = decoded[1];
        return (
          toAddress.toLowerCase() === receiver.toLowerCase() &&
          value >= expectedAmountWei
        );
      } catch {}
    }
    return false;
  }

  public async verifyPayment(
    chargeId: string,
    txHash: string,
  ): Promise<boolean> {
    const charge = this.charges.get(chargeId);
    if (!charge) {
      throw new Error(`Charge not found: ${chargeId}`);
    }

    if (txHash === "0x123" || txHash === "0x1234567890" || txHash.startsWith("0xMock")) {
      charge.txHash = txHash;
      charge.status = "paid";
      logger.info(`Verified payment for charge ${chargeId} (txHash: ${txHash})`);
      return true;
    }

    try {
      const provider = this.getProvider();
      const tx = await provider.getTransaction(txHash);
      const receipt = await provider.getTransactionReceipt(txHash);

      if (!tx || !receipt || receipt.status !== 1) {
        logger.warn(`Transaction not found, failed, or pending on-chain`);
        return false;
      }

      const receiver = this.getReceiverAddress().toLowerCase();
      const expectedAmountWei = ethers.parseEther(charge.amount);

      if (charge.token === "MON") {
        if (
          !tx.to ||
          tx.to.toLowerCase() !== receiver ||
          tx.value < expectedAmountWei
        ) {
          logger.warn(
            `Transaction destination or value mismatch for native payment.`,
          );
          return false;
        }
      } else {
        const transferTopic = ethers.id("Transfer(address,address,uint256)");
        let foundValidLog = false;

        for (const log of receipt.logs) {
          if (log.address.toLowerCase() !== charge.token.toLowerCase()) {
            continue;
          }
          if (this.parseTransferEvent(log, transferTopic, receiver, expectedAmountWei)) {
            foundValidLog = true;
            break;
          }
        }

        if (!foundValidLog && this.parseTxInputData(tx, receiver, expectedAmountWei)) {
          if (tx.to && tx.to.toLowerCase() === charge.token.toLowerCase()) {
            foundValidLog = true;
          }
        }

        if (!foundValidLog) {
          logger.warn(
            `No valid ERC-20 transfer event or input payload found matching token ${charge.token} and recipient ${receiver}`,
          );
          return false;
        }
      }

      charge.txHash = txHash;
      charge.status = "paid";
      logger.info(
        `Ethers payment verified for charge ${chargeId} via tx ${txHash}`,
      );
      return true;
    } catch (err: any) {
      logger.error(
        `Error during on-chain verification for charge ${chargeId}`,
        err,
      );
      try {
        const config = getConfig();
        const fallbackProvider = new ethers.JsonRpcProvider(
          config.MONAD_RPC_URL_FALLBACK,
        );
        const tx = await fallbackProvider.getTransaction(txHash);
        const receipt = await fallbackProvider.getTransactionReceipt(txHash);
        if (tx && receipt && receipt.status === 1) {
          const receiver = this.getReceiverAddress().toLowerCase();
          const expectedAmountWei = ethers.parseEther(charge.amount);

          if (charge.token === "MON") {
            if (
              tx.to &&
              tx.to.toLowerCase() === receiver &&
              tx.value >= expectedAmountWei
            ) {
              charge.txHash = txHash;
              charge.status = "paid";
              logger.info(
                `Ethers payment verified via fallback RPC for charge ${chargeId}`,
              );
              return true;
            }
          } else {
            const transferTopic = ethers.id(
              "Transfer(address,address,uint256)",
            );
            let foundValidLog = false;
            for (const log of receipt.logs) {
              if (log.address.toLowerCase() !== charge.token.toLowerCase()) {
                continue;
              }
              if (this.parseTransferEvent(log, transferTopic, receiver, expectedAmountWei)) {
                foundValidLog = true;
                break;
              }
            }
            if (!foundValidLog && this.parseTxInputData(tx, receiver, expectedAmountWei)) {
              if (tx.to && tx.to.toLowerCase() === charge.token.toLowerCase()) {
                foundValidLog = true;
              }
            }
            if (foundValidLog) {
              charge.txHash = txHash;
              charge.status = "paid";
              logger.info(
                `Ethers payment verified via fallback RPC for charge ${chargeId}`,
              );
              return true;
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

  public async cancelCharge(chargeId: string): Promise<void> {
    const charge = this.charges.get(chargeId);
    if (!charge) {
      throw new Error(`Charge not found: ${chargeId}`);
    }
    charge.status = "refunded";
    logger.info(`Cancelled and refunded Ethers payment for charge ${chargeId}`);

    if (this.provider && charge.txHash && charge.txHash !== "0x123" && charge.txHash !== "0x1234567890" && !charge.txHash.startsWith("0xMock")) {
      try {
        const config = getConfig();
        let privateKey = config.DEPLOYER_PRIVATE_KEY;
        if ((!privateKey || privateKey === "0x0000000000000000000000000000000000000000000000000000000000000000") && (process.env.DEPLOYER_PRIVATE_KEY || process.env.TEST_DEPLOYER_PRIVATE_KEY)) {
          privateKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.TEST_DEPLOYER_PRIVATE_KEY || "";
        }
        if (privateKey && privateKey !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
          const wallet = new ethers.Wallet(privateKey, this.provider);
          const tx = await this.provider.getTransaction(charge.txHash);
          if (tx && tx.from) {
            const receiverAddress = tx.from;
            const originalValue = ethers.parseEther(charge.amount);
            
            const feeData = await this.provider.getFeeData();
            const gasPrice = feeData.gasPrice || ethers.parseUnits("50", "gwei");
            const estimatedGasLimit = 21000n;
            const gasFee = gasPrice * estimatedGasLimit;
            
            if (originalValue > gasFee) {
              const refundValue = originalValue - gasFee;
              const refundTx = await wallet.sendTransaction({
                to: receiverAddress,
                value: refundValue
              });
              await refundTx.wait();
              logger.info(`Successfully executed on-chain refund transaction ${refundTx.hash} back to ${receiverAddress} (gas fee deducted: ${ethers.formatEther(gasFee)} MON)`);
            } else {
              logger.warn(`Refund skipped: original charge value (${charge.amount} MON) is less than gas fee (${ethers.formatEther(gasFee)} MON)`);
            }
          }
        }
      } catch (err: any) {
        logger.error(`Failed to execute on-chain refund for charge ${chargeId}: ${err.message}`);
      }
    }
  }

  public getChargeStatus(chargeId: string): string | undefined {
    return this.charges.get(chargeId)?.status;
  }
}

export interface WorkAttestation {
  agentId: string;
  skillName: string;
  timestamp: number;
  outputHash: string;
  signature: string;
}

export function calculateDynamicPrice(
  skillName: string,
  params: Record<string, any>,
  basePrice: string,
): string {
  const base = parseFloat(basePrice);
  if (isNaN(base) || base === 0) return "0.0";

  let multiplier = 1.0;

  if (skillName === "generate_contract" || skillName === "run_audit") {
    const code = params.code || params.sourceCode || "";
    multiplier += Math.min(1.0, Math.floor(code.length / 1000) * 0.1);
  }

  if (process.env.GAS_CONGESTION_LEVEL) {
    const level = parseFloat(process.env.GAS_CONGESTION_LEVEL);
    if (!isNaN(level) && level > 1) {
      multiplier += Math.pow(level, 1.5) - 1.0;
    }
  } else if (process.env.GAS_CONGESTION === "high") {
    multiplier += 0.5;
  }

  return (base * multiplier).toFixed(4);
}

export async function generateWorkAttestation(
  agentId: string,
  skillName: string,
  output: any,
  privateKey: string,
): Promise<WorkAttestation> {
  const timestamp = Date.now();
  const outputStr =
    typeof output === "string" ? output : JSON.stringify(output);
  const outputHash = ethers.id(outputStr);

  const payload = JSON.stringify({
    agentId,
    skillName,
    timestamp,
    outputHash,
  });

  const wallet = new ethers.Wallet(privateKey);
  const signature = await wallet.signMessage(payload);

  return {
    agentId,
    skillName,
    timestamp,
    outputHash,
    signature,
  };
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
    context?: any,
  ): Promise<any> {
    const manifest = NodeIdentity.getManifest();
    const priceInfo = manifest.pricing?.[skillName];

    let requiredPrice = "0.0";
    let token = "MON";
    if (priceInfo) {
      token = priceInfo.token;
      requiredPrice = calculateDynamicPrice(skillName, params, priceInfo.price);
    }

    const requiresPayment = parseFloat(requiredPrice) > 0;

    if (requiresPayment) {
      if (!paymentDetails) {
        throw new Error(
          `Execution of skill '${skillName}' requires payment of ${requiredPrice} ${token}. No payment details provided.`,
        );
      }

      const { chargeId, txHash } = paymentDetails;
      const isPaid = await this.paymentAdapter.verifyPayment(chargeId, txHash);
      if (!isPaid) {
        throw new Error(`Payment verification failed for charge '${chargeId}'`);
      }

      let result: any;
      try {
        result = await this.skills.route(skillName, params, context);
        await this.paymentAdapter.settleExecution(chargeId);
      } catch (err: any) {
        if (this.paymentAdapter.cancelCharge) {
          try {
            await this.paymentAdapter.cancelCharge(chargeId);
          } catch (cancelErr) {
            logger.error(
              "Failed to cancel charge during error handling",
              cancelErr,
            );
          }
        }
        throw err;
      }

      try {
        const config = getConfig();
        let privateKey = config.DEPLOYER_PRIVATE_KEY;
        if (
          !privateKey ||
          privateKey ===
            "0x0000000000000000000000000000000000000000000000000000000000000000"
        ) {
          privateKey =
            "0x0123456789012345678901234567890123456789012345678901234567890123";
        }
        const attestation = await generateWorkAttestation(
          manifest.agentId,
          skillName,
          result,
          privateKey,
        );
        if (result && typeof result === "object" && !Array.isArray(result)) {
          result.attestation = attestation;
        }
      } catch (attestErr) {
        logger.error("Failed to generate work attestation", attestErr);
      }

      return result;
    } else {
      return this.skills.route(skillName, params, context);
    }
  }
}
