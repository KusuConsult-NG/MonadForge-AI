# AMM Security Policy

- Slippage checks on all swap and addLiquidity methods.
- ReentrancyGuard for liquidity pools.
- SafeTransfer helper library usage to prevent ERC20 silent failures.
