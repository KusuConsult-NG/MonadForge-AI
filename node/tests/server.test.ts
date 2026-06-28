import {
  NodeIdentity,
  NodeRouter,
  MonetizedExecutor,
  NodeServer,
  MockPaymentAdapter,
} from "../src/index";
import { ethers } from "ethers";

describe("Node HTTP Server & Client Tests", () => {
  let server: NodeServer;
  let executor: MonetizedExecutor;
  let testPort = 13010;
  let privateKey =
    "0x0123456789012345678901234567890123456789012345678901234567890123";
  let wallet = new ethers.Wallet(privateKey);

  beforeAll(async () => {
    executor = new MonetizedExecutor(new MockPaymentAdapter());
    server = new NodeServer(executor);
    await server.start(testPort);
  });

  afterAll(async () => {
    await server.stop();
  });

  it("should return the node manifest via GET /manifest", async () => {
    const response = await fetch(`http://localhost:${testPort}/manifest`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.agentId).toBe("monadforge-node");
  });

  it("should respond to OPTIONS preflight requests with CORS headers", async () => {
    const response = await fetch(`http://localhost:${testPort}/manifest`, {
      method: "OPTIONS",
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toContain(
      "POST",
    );
  });

  it("should return 404 for unknown endpoints", async () => {
    const response = await fetch(`http://localhost:${testPort}/unknown`);
    expect(response.status).toBe(404);
  });

  it("should reject POST /invoke with missing auth headers", async () => {
    const response = await fetch(`http://localhost:${testPort}/invoke`, {
      method: "POST",
      body: JSON.stringify({
        skillName: "search_docs",
        params: { query: "test" },
        timestamp: Date.now().toString(),
      }),
    });
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toContain("Missing authentication headers");
  });

  it("should reject POST /invoke with invalid cryptographic signature", async () => {
    const bodyObj = {
      skillName: "search_docs",
      params: { query: "test" },
      timestamp: Date.now().toString(),
    };
    const bodyStr = JSON.stringify(bodyObj);

    const response = await fetch(`http://localhost:${testPort}/invoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Node-Sender": wallet.address,
        "X-Node-Signature": "0x" + "0".repeat(130), // Malformed/invalid signature
      },
      body: bodyStr,
    });
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain("validation failed");
  });

  it("should reject POST /invoke if signature recovered address doesn't match sender header", async () => {
    const bodyObj = {
      skillName: "search_docs",
      params: { query: "test" },
      timestamp: Date.now().toString(),
    };
    const bodyStr = JSON.stringify(bodyObj);

    const correctSig = await wallet.signMessage(bodyStr);

    const response = await fetch(`http://localhost:${testPort}/invoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Node-Sender": "0x0000000000000000000000000000000000000000", // Mismatched sender
        "X-Node-Signature": correctSig,
      },
      body: bodyStr,
    });
    expect(response.status).toBe(403);
  });

  it("should reject POST /invoke if timestamp drift is too high (expired)", async () => {
    // 10 minutes in the past
    const oldTimestamp = (Date.now() - 600000).toString();
    const bodyObj = {
      skillName: "search_docs",
      params: { query: "test" },
      timestamp: oldTimestamp,
    };
    const bodyStr = JSON.stringify(bodyObj);

    const correctSig = await wallet.signMessage(bodyStr);

    const response = await fetch(`http://localhost:${testPort}/invoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Node-Sender": wallet.address,
        "X-Node-Signature": correctSig,
      },
      body: bodyStr,
    });
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Request expired");
  });

  it("should allow POST /invoke with high drift if MAX_CLOCK_DRIFT_MS is increased", async () => {
    process.env.MAX_CLOCK_DRIFT_MS = "900000"; // 15 minutes allowed
    const oldTimestamp = (Date.now() - 600000).toString();
    const bodyObj = {
      skillName: "search_docs",
      params: { query: "test" },
      timestamp: oldTimestamp,
    };
    const bodyStr = JSON.stringify(bodyObj);

    const correctSig = await wallet.signMessage(bodyStr);

    const response = await fetch(`http://localhost:${testPort}/invoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Node-Sender": wallet.address,
        "X-Node-Signature": correctSig,
      },
      body: bodyStr,
    });
    expect(response.status).toBe(200);
    delete process.env.MAX_CLOCK_DRIFT_MS;
  });

  it("should allow POST /invoke with high drift if MAX_CLOCK_DRIFT_MS is set to 0 (disabled)", async () => {
    process.env.MAX_CLOCK_DRIFT_MS = "0"; // check disabled
    const oldTimestamp = (Date.now() - 600000).toString();
    const bodyObj = {
      skillName: "search_docs",
      params: { query: "test" },
      timestamp: oldTimestamp,
    };
    const bodyStr = JSON.stringify(bodyObj);

    const correctSig = await wallet.signMessage(bodyStr);

    const response = await fetch(`http://localhost:${testPort}/invoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Node-Sender": wallet.address,
        "X-Node-Signature": correctSig,
      },
      body: bodyStr,
    });
    expect(response.status).toBe(200);
    delete process.env.MAX_CLOCK_DRIFT_MS;
  });

  it("should execute skill successfully on valid signed request", async () => {
    const bodyObj = {
      skillName: "search_docs",
      params: { query: "Monad staking" },
      timestamp: Date.now().toString(),
    };
    const bodyStr = JSON.stringify(bodyObj);

    const correctSig = await wallet.signMessage(bodyStr);

    const response = await fetch(`http://localhost:${testPort}/invoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Node-Sender": wallet.address,
        "X-Node-Signature": correctSig,
      },
      body: bodyStr,
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.result.topMatches).toBeDefined();
  });

  it("should return 500 if capability execution throws an error", async () => {
    // "generate_contract" requires parameters (name, symbol, domain)
    // Sending empty params object should trigger validation/execution failure
    const bodyObj = {
      skillName: "generate_contract",
      params: {},
      timestamp: Date.now().toString(),
    };
    const bodyStr = JSON.stringify(bodyObj);

    const correctSig = await wallet.signMessage(bodyStr);

    const response = await fetch(`http://localhost:${testPort}/invoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Node-Sender": wallet.address,
        "X-Node-Signature": correctSig,
      },
      body: bodyStr,
    });
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });

  it("should route remote node requests via real HTTP using NodeRouter", async () => {
    // Register remote node with endpointUrl pointing to our test server
    const remoteAgentId = "remote-node";
    const remoteManifest = {
      agentId: remoteAgentId,
      name: "Remote MonadForge Node",
      endpointUrl: `localhost:${testPort}`,
      pricing: {
        search_docs: { price: "0.0", token: "MON" },
      },
    };
    NodeRouter.registerAgent(remoteAgentId, remoteManifest);

    const result = await NodeRouter.invokeAgent(remoteAgentId, "search_docs", {
      query: "monad parallel execution",
    });
    expect(result.topMatches).toBeDefined();
  });

  it("should propagate errors if real HTTP routing call fails", async () => {
    const badAgentId = "failed-node";
    const badManifest = {
      agentId: badAgentId,
      name: "Bad Node",
      endpointUrl: `localhost:${testPort}`,
      pricing: {
        generate_contract: { price: "0.0", token: "MON" },
      },
    };
    NodeRouter.registerAgent(badAgentId, badManifest);

    // generate_contract with empty params fails (HTTP 500)
    await expect(
      NodeRouter.invokeAgent(badAgentId, "generate_contract", {}),
    ).rejects.toThrow("HTTP error 500");
  });

  it("should handle invalid hostnames in HTTP routing", async () => {
    const unreachableAgentId = "unreachable-node";
    const unreachableManifest = {
      agentId: unreachableAgentId,
      name: "Offline Node",
      endpointUrl: `invalid-host-name-xyz:9999`,
      pricing: {
        search_docs: { price: "0.0", token: "MON" },
      },
    };
    NodeRouter.registerAgent(unreachableAgentId, unreachableManifest);

    await expect(
      NodeRouter.invokeAgent(unreachableAgentId, "search_docs", {
        query: "test",
      }),
    ).rejects.toThrow();
  });

  it("should support start/stop lifecycles cleanly", async () => {
    const extraServer = new NodeServer();
    await extraServer.start(13011);
    await extraServer.start(13011); // Resolve immediately if already running
    await extraServer.stop();
    await extraServer.stop(); // Resolve immediately if already stopped
  });

  it("should sign payload using static helper", async () => {
    const sig = await NodeServer.signPayload("test-payload", privateKey);
    expect(sig.startsWith("0x")).toBe(true);
  });

  it("should reject start if port is already in use", async () => {
    const conflictServer = new NodeServer();
    await expect(conflictServer.start(testPort)).rejects.toThrow();
  });

  it("should reject stop if close returns error", async () => {
    const dummyServer = new NodeServer();
    await dummyServer.start(13012);
    const origClose = (dummyServer as any).server.close;
    (dummyServer as any).server.close = (cb: any) =>
      cb(new Error("Close error"));
    await expect(dummyServer.stop()).rejects.toThrow("Close error");
    (dummyServer as any).server.close = origClose;
    await dummyServer.stop();
  });

  it("should handle remote HTTP error with statusText fallback", async () => {
    const badRouteAgentId = "bad-route-node";
    const badRouteManifest = {
      agentId: badRouteAgentId,
      name: "Bad Route Node",
      endpointUrl: `localhost:${testPort}/non-existent`,
      pricing: {
        search_docs: { price: "0.0", token: "MON" },
      },
    };
    NodeRouter.registerAgent(badRouteAgentId, badRouteManifest);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: jest.fn().mockRejectedValue(new Error("No JSON")),
    } as any);

    await expect(
      NodeRouter.invokeAgent(badRouteAgentId, "search_docs", {
        query: "test",
      }),
    ).rejects.toThrow("HTTP error 404: Not Found");

    globalThis.fetch = originalFetch;
  });
});
