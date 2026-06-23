# OpenZeppelin ERC20 Token Contract Reference

The OpenZeppelin ERC20 token implementation is the industry standard for creating fungible tokens on EVM networks like Monad.

## Import Syntax
To import the OpenZeppelin ERC20 contract inside your Solidity file:
```solidity
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
```

## Basic Structure
A standard ERC20 contract extends the base `ERC20` contract and uses `Ownable` for administration:
```solidity
contract ForgeToken is ERC20, Ownable {
    constructor(uint256 initialSupply) ERC20("ForgeToken", "FORGE") Ownable(msg.sender) {
        _mint(msg.sender, initialSupply * 10 ** decimals());
    }
}
```

## Security Best Practices
- Never allow public minting without modifiers like `onlyOwner`.
- Guard external transfer calls if needed or follow checks-effects-interactions.
- Keep decimals to 18 unless a specific use case dictates otherwise.
