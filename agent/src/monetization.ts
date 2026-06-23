import { createLogger } from "@monadforge/sdk";
import { AgentSkills } from "@monadforge/skills";
import { AgentIdentity } from "./manifest";

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
