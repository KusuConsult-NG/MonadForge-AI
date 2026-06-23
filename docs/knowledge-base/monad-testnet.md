# Monad Testnet authoritative reference

The Monad Testnet is the primary sandbox environment for developers deploying EVM-compatible decentralized applications.

## Network RPC parameters
- **Network Name:** Monad Testnet
- **RPC URL:** https://testnet-rpc.monad.xyz
- **Chain ID:** 10143
- **Currency Symbol:** MON
- **Block Explorer:** https://testnet.monadexplorer.com

## Faucet Information
Developers can request test tokens (MON) from the official faucet at:
https://faucet.monad.xyz
Maximum payout is 10 MON per address per 24 hours.

## Deployment Guidelines
Always verify contracts on the Monad Explorer using hardhat or foundry verification plugins. Since Monad is fully EVM-compatible, standard ethereum developer tools compile and deploy with zero code changes.
