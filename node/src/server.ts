import * as http from "http";
import { ethers } from "ethers";
import { createLogger, getConfig } from "@monadforge/sdk";
import { MonetizedExecutor } from "./monetization";
import { NodeIdentity } from "./manifest";

const logger = createLogger("NodeServer");

export class NodeServer {
  private server: http.Server | null = null;
  private executor: MonetizedExecutor;

  constructor(executor: MonetizedExecutor = new MonetizedExecutor()) {
    this.executor = executor;
  }

  /**
   * Recovers signer address from message signature.
   */
  public static verifySignature(payload: string, signature: string): string {
    try {
      return ethers.verifyMessage(payload, signature);
    } catch (err: any) {
      logger.error("Failed to verify signature", err);
      throw new Error("Invalid signature format");
    }
  }

  /**
   * Signs a payload using the node's private key.
   */
  public static async signPayload(
    payload: string,
    privateKey: string,
  ): Promise<string> {
    const wallet = new ethers.Wallet(privateKey);
    return wallet.signMessage(payload);
  }

  public start(port: number = 3010): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        return resolve();
      }

      this.server = http.createServer(async (req, res) => {
        const { method, url } = req;

        // CORS headers
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Content-Type, X-Node-Signature, X-Node-Sender",
        );

        if (method === "OPTIONS") {
          res.writeHead(204);
          res.end();
          return;
        }

        if (method === "GET" && url === "/manifest") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(NodeIdentity.getManifest()));
          return;
        }

        if (method === "POST" && url === "/invoke") {
          let body = "";
          req.on("data", (chunk) => {
            body += chunk;
          });

          req.on("end", async () => {
            try {
              const signature = req.headers["x-node-signature"] as string;
              const sender = req.headers["x-node-sender"] as string;

              if (!signature || !sender) {
                res.writeHead(401, { "Content-Type": "application/json" });
                res.end(
                  JSON.stringify({
                    error:
                      "Missing authentication headers (X-Node-Signature or X-Node-Sender)",
                  }),
                );
                return;
              }

              // Verify signature
              let recoveredSender: string;
              try {
                recoveredSender = NodeServer.verifySignature(body, signature);
              } catch (err: any) {
                res.writeHead(403, { "Content-Type": "application/json" });
                res.end(
                  JSON.stringify({
                    error: `Cryptographic signature validation failed: ${err.message}`,
                  }),
                );
                return;
              }

              if (recoveredSender.toLowerCase() !== sender.toLowerCase()) {
                res.writeHead(403, { "Content-Type": "application/json" });
                res.end(
                  JSON.stringify({
                    error:
                      "Cryptographic signature validation failed: sender does not match signature",
                  }),
                );
                return;
              }

              // Parse payload
              const payload = JSON.parse(body);
              const { skillName, params, paymentDetails, timestamp } = payload;

              // Validate request age (prevent replay attacks: max 5 minutes drift)
              const requestTime = parseInt(timestamp, 10);
              const currentTime = Date.now();
              if (
                isNaN(requestTime) ||
                Math.abs(currentTime - requestTime) > 300000
              ) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(
                  JSON.stringify({
                    error: "Request expired or timestamp drift is too high",
                  }),
                );
                return;
              }

              // Execute
              logger.info(
                `Received A2A invocation request for skill '${skillName}' from ${sender}`,
              );
              const result = await this.executor.executeSkill(
                skillName,
                params,
                paymentDetails,
              );

              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: true, result }));
            } catch (err: any) {
              logger.error("Error executing A2A request via server", err);
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  error:
                    err.message ||
                    "Internal server error during capability execution",
                }),
              );
            }
          });
          return;
        }

        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not Found" }));
      });

      this.server.listen(port, () => {
        logger.info(`Node server listening on port ${port}`);
        resolve();
      });

      this.server.on("error", (err) => {
        logger.error("Server start error", err);
        reject(err);
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        return resolve();
      }
      this.server.close((err) => {
        if (err) {
          logger.error("Error closing server", err);
          return reject(err);
        }
        this.server = null;
        logger.info("Node server stopped");
        resolve();
      });
    });
  }
}
