# MonadForge AI Quick Start Guide

Go from zero to deployment on the Monad blockchain in under 10 minutes.

---

## 1. Quick Setup (1 Minute)

Initialize a new local Monad project using the one-command installer:

```bash
npx @monadforge/ai init --name my-monadforge-project
cd my-monadforge-project
```

This command automatically:
- Initializes the `contracts/`, `test/`, and `scripts/` directories.
- Writes a default `monadforge.json` configuration file.
- Sets up local project memory.

---

## 2. Install Development Dependencies (1 Minute)

Ensure you have hardhat and OpenZeppelin contracts installed:

```bash
npm init -y
npm install --save-dev hardhat @openzeppelin/contracts dotenv
```

---

## 3. Generate a Smart Contract Template (2 Minutes)

Generate a pre-configured ERC20 token contract:

```bash
npx @monadforge/ai generate erc20 --name VibeToken --symbol VIBE --supply 100000000
```

This generates:
- `contracts/VibeToken.sol`
- `test/VibeToken.test.ts`
- `scripts/deploy.ts`

---

## 4. Run an Security Audit (2 Minutes)

Run a static security audit on your generated contract files to make sure there are no critical access control or reentrancy bugs:

```bash
npx @monadforge/ai audit contracts/VibeToken.sol
```

Review the output report. Any issues detected will be listed along with remediation steps.

---

## 5. Deploy to Monad Testnet (3 Minutes)

Configure your wallet private key:

```bash
export DEPLOYER_PRIVATE_KEY="0xYOUR_TESTNET_PRIVATE_KEY_HEX"
```

Trigger the automated deployment step:

```bash
npx @monadforge/ai deploy
```

The system will compile, deploy, and verify the contract on Monad Testnet, outputting the contract address and explorer link.
