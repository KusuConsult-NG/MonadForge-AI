# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-06-22

### Added
- Created publishable npm workspace wrapper `@monadforge/ai`.
- Implemented `review_architecture` and `create_nft` alias tools in the MCP Server.
- Drafted the Monad Agent Standard (MAS) specification under `docs/MAS/`.
- Pre-configured contract templates for erc20, erc721, dao, staking, amm, and marketplace.
- Added actual examples inside `examples/` with Solidity files and tests.
- Designed one-command setup: `npx @monadforge/ai init`.
- Wrote GitHub Actions build and publish pipeline.
