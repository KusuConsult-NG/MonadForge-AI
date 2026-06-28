import {
  IAuditEngine,
  AuditReportDetails,
  AuditIssue,
  createLogger,
} from "@monadforge/sdk";
import { parse, visit } from "@solidity-parser/parser";

const logger = createLogger("AuditEngine");

function getCallExpression(node: any): any {
  if (!node) return null;
  if (node.type === "NameValueExpression") {
    return getCallExpression(node.expression);
  }
  return node;
}

export class AuditEngine implements IAuditEngine {
  public async runAudit(
    contractSource: string,
  ): Promise<AuditReportDetails & { riskScore: number }> {
    logger.info("Starting smart contract security audit", {
      operation: "runAudit",
    });

    const issues: AuditIssue[] = [];
    const recommendations: string[] = [];

    try {
      // 1. Attempt to parse source into an AST
      const ast = parse(contractSource, { loc: true });
      logger.info("Analyzing Solidity Abstract Syntax Tree (AST)");
      this.runASTAudit(ast, contractSource, issues);
    } catch (err: any) {
      // 2. Fall back to regex parsing on syntax errors
      logger.warn(
        "Solidity AST parsing failed. Falling back to regex-based heuristics.",
        err,
      );
      this.runRegexAudit(contractSource, issues);
    }

    // Calculate Risk Score (100 is worst, 0 is best)
    let totalRiskWeight = 0;
    issues.forEach((issue) => {
      if (issue.severity === "Critical") totalRiskWeight += 40;
      else if (issue.severity === "High") totalRiskWeight += 25;
      else if (issue.severity === "Medium") totalRiskWeight += 10;
      else if (issue.severity === "Low") totalRiskWeight += 5;
    });

    const riskScore = Math.max(0, Math.min(100, totalRiskWeight));

    // Compile recommendations
    issues.forEach((issue) => {
      recommendations.push(`${issue.id}: ${issue.recommendation}`);
    });

    logger.info(`Audit completed. Risk Score: ${riskScore}`, {
      status: "success",
    });

    return {
      issues,
      recommendations,
      riskScore,
    };
  }

  /**
   * AST-based static analysis checks.
   */
  private runASTAudit(ast: any, source: string, issues: AuditIssue[]): void {
    // 1. Compiler version validation (OVERFLOW-001) / missing pragma directive (PRAGMA-001)
    let hasPragma = false;
    visit(ast, {
      PragmaDirective(node) {
        if (node.name === "solidity") {
          hasPragma = true;
          const versionString = node.value;
          if (
            versionString.includes("0.7") ||
            versionString.includes("0.6") ||
            versionString.includes("0.5")
          ) {
            issues.push({
              id: "OVERFLOW-001",
              severity: "High",
              category: "Integer Overflow",
              title: "Outdated Compiler Version (Integer Overflow Risk)",
              description: `The contract uses compiler version ${versionString}. Solidity versions below 0.8.0 do not have overflow checks enabled by default.`,
              recommendation:
                "Upgrade to Solidity 0.8.0 or newer, or use OpenZeppelin SafeMath library.",
            });
          }
        }
      },
    });

    if (!hasPragma) {
      issues.push({
        id: "PRAGMA-001",
        severity: "Medium",
        category: "Syntax validation",
        title: "Missing Compiler Pragma Directive",
        description:
          "No pragma solidity version defined in the contract source code.",
        recommendation:
          'Add "pragma solidity ^0.8.20;" at the top of your Solidity files.',
      });
    }

    // 2. Access Control / Ownership Risks (ACCESS-001)
    visit(ast, {
      FunctionDefinition(node) {
        if (node.isConstructor || !node.name) return;
        const sensitiveNames = [
          "mint",
          "burn",
          "withdraw",
          "pause",
          "transferownership",
          "setreward",
        ];
        const isSensitive = sensitiveNames.some((name) =>
          node.name!.toLowerCase().includes(name),
        );
        const isPublicOrExternal =
          node.visibility === "public" || node.visibility === "external";

        if (isSensitive && isPublicOrExternal) {
          const hasGuard = node.modifiers?.some((mod) => {
            const name = mod.name.toLowerCase();
            return (
              name.includes("onlyowner") ||
              name.includes("onlyrole") ||
              name.includes("hasrole")
            );
          });
          if (!hasGuard) {
            issues.push({
              id: "ACCESS-001",
              severity: "Critical",
              category: "Access Control",
              title: `Unprotected Sensitive Function: ${node.name}`,
              description: `The function "${node.name}" is marked public or external but does not appear to contain access control modifiers like "onlyOwner" or "onlyRole".`,
              recommendation:
                "Add appropriate access control modifiers or internal authorization checks.",
            });
          }
        }
      },
    });

    // 3. Reentrancy Checks (REENTRANCY-001 / REENTRANCY-002)
    visit(ast, {
      ContractDefinition(contractNode) {
        const hasReentrancyGuard = contractNode.baseContracts.some((bc) =>
          bc.baseName.namePath.toLowerCase().includes("reentrancyguard"),
        );

        visit(contractNode, {
          FunctionDefinition(funcNode) {
            if (!funcNode.body) return;

            let containsCall = false;
            visit(funcNode.body, {
              FunctionCall(callNode) {
                const expr = getCallExpression(callNode.expression);
                if (expr && expr.type === "MemberAccess") {
                  const mName = expr.memberName;
                  if (
                    mName === "call" ||
                    mName === "transfer" ||
                    mName === "send"
                  ) {
                    containsCall = true;
                  }
                }
              },
            });

            if (containsCall) {
              const hasGuardModifier = (funcNode.modifiers || []).some(
                (mod: any) => mod.name.toLowerCase().includes("nonreentrant"),
              );

              if (!hasReentrancyGuard || !hasGuardModifier) {
                issues.push({
                  id: "REENTRANCY-001",
                  severity: "High",
                  category: "Reentrancy",
                  title: "External Call without ReentrancyGuard",
                  description:
                    'The contract makes low-level calls or ether transfers but does not inherit from ReentrancyGuard or apply "nonReentrant" modifier to the function.',
                  recommendation:
                    'Inherit from OpenZeppelin ReentrancyGuard and apply "nonReentrant" modifier to all state-changing functions performing external calls.',
                });
              }

              // REENTRANCY-002: State updates after call
              let externalCallFound = false;
              visit(funcNode.body, {
                FunctionCall(callNode) {
                  const expr = getCallExpression(callNode.expression);
                  if (
                    expr &&
                    expr.type === "MemberAccess" &&
                    ["call", "transfer", "send"].includes(expr.memberName)
                  ) {
                    externalCallFound = true;
                  }
                },
                BinaryOperation(binNode) {
                  if (
                    externalCallFound &&
                    ["=", "+=", "-="].includes(binNode.operator)
                  ) {
                    issues.push({
                      id: "REENTRANCY-002",
                      severity: "Critical",
                      category: "Reentrancy",
                      title: "State Variable Update after External Call",
                      description:
                        "A state variable appears to be modified after an external call instruction, creating a potential reentrancy vulnerability.",
                      recommendation:
                        "Apply the checks-effects-interactions pattern: update state variables before making external calls.",
                    });
                  }
                },
                UnaryOperation(unNode) {
                  if (
                    externalCallFound &&
                    ["++", "--"].includes(unNode.operator)
                  ) {
                    issues.push({
                      id: "REENTRANCY-002",
                      severity: "Critical",
                      category: "Reentrancy",
                      title: "State Variable Update after External Call",
                      description:
                        "A state variable appears to be modified after an external call instruction, creating a potential reentrancy vulnerability.",
                      recommendation:
                        "Apply the checks-effects-interactions pattern: update state variables before making external calls.",
                    });
                  }
                },
              });
            }
          },
        });
      },
    });

    // 4. Dangerous Low-Level Calls (CALL-001)
    visit(ast, {
      ExpressionStatement(node) {
        const expr = node.expression;
        if (expr && expr.type === "FunctionCall") {
          const callExpr = getCallExpression(expr.expression);
          if (
            callExpr &&
            callExpr.type === "MemberAccess" &&
            callExpr.memberName === "call"
          ) {
            issues.push({
              id: "CALL-001",
              severity: "High",
              category: "Dangerous External Call",
              title: "Unchecked Return Value of Low-Level Call",
              description:
                "A low-level call is executed but its return value (success boolean) is not captured or validated.",
              recommendation:
                "Always check the return value of low-level calls: (bool success, ) = target.call(...); require(success);",
            });
          }
        }
      },
    });

    // 5. tx.origin Authorization Check (TX-ORIGIN-001)
    visit(ast, {
      MemberAccess(node) {
        if (
          node.expression &&
          (node.expression as any).type === "Identifier" &&
          (node.expression as any).name === "tx" &&
          node.memberName === "origin"
        ) {
          if (node.loc) {
            const lines = source.split("\n");
            const lineContent = lines[node.loc.start.line - 1] || "";
            if (
              lineContent.includes("require") ||
              lineContent.includes("if") ||
              /[<>]=?|==|!=/.test(lineContent)
            ) {
              issues.push({
                id: "TX-ORIGIN-001",
                severity: "Critical",
                category: "Authorization bypass",
                title: "Authorization via tx.origin",
                description:
                  "Using tx.origin for authorization checks makes the contract vulnerable to phishing attacks (reentrancy/caller spoofing via malicious contracts).",
                recommendation:
                  'Replace "tx.origin" authorization checks with "msg.sender".',
              });
            }
          }
        }
      },
    });

    // 6. Unsafe ERC20 Transfer (ERC20-TRANSFER-001)
    visit(ast, {
      ExpressionStatement(node) {
        const expr = node.expression;
        if (
          expr &&
          expr.type === "FunctionCall" &&
          expr.expression &&
          (expr.expression as any).type === "MemberAccess" &&
          ((expr.expression as any).memberName === "transfer" ||
            (expr.expression as any).memberName === "transferFrom")
        ) {
          const caller = (expr.expression as any).expression;
          const isNativeTransfer =
            caller &&
            caller.type === "FunctionCall" &&
            caller.expression &&
            caller.expression.type === "Identifier" &&
            (caller.expression.name === "payable" ||
              caller.expression.name === "address");
          if (!isNativeTransfer) {
            issues.push({
              id: "ERC20-TRANSFER-001",
              severity: "High",
              category: "Unsafe ERC20 Operation",
              title: "Unchecked ERC20 Transfer Return Value",
              description:
                "The return value of an ERC20 token transfer or transferFrom call is unchecked. Some tokens return false on failure instead of reverting.",
              recommendation:
                "Use OpenZeppelin's SafeERC20 library or wrap the transfer call in a require statement: require(token.transfer(to, amount));",
            });
          }
        }
      },
    });

    // 7. block.timestamp Dependency (TIMESTAMP-001 / TIMESTAMP-002)
    visit(ast, {
      MemberAccess(node) {
        if (
          node.expression.type === "Identifier" &&
          node.expression.name === "block" &&
          node.memberName === "timestamp"
        ) {
          if (node.loc) {
            const lines = source.split("\n");
            const lineContent = lines[node.loc.start.line - 1] || "";
            if (
              lineContent.includes("keccak256") ||
              lineContent.includes("abi.encode")
            ) {
              issues.push({
                id: "TIMESTAMP-001",
                severity: "High",
                category: "Weak Randomness",
                title: "Weak Randomness from block.timestamp",
                description:
                  "The contract uses block.timestamp (or now) as a seed for randomness. Block timestamps can be manipulated by miners within certain limits.",
                recommendation:
                  "Use Chainlink VRF (Verifiable Random Function) or other secure sources of randomness.",
              });
            } else if (/[<>]=?|==|!=/.test(lineContent)) {
              issues.push({
                id: "TIMESTAMP-002",
                severity: "Low",
                category: "Timestamp Dependency",
                title: "Timestamp Dependency for Timing Logic",
                description:
                  "The contract relies on block.timestamp for comparisons. Miners can influence block timestamps slightly, which can affect precise timing logic.",
                recommendation:
                  "Avoid relying on exact block timestamps for high-precision time checks. Tolerances should account for up to 15-second drifts.",
              });
            }
          }
        }
      },
    });

    // 8. State Variable Shadowing (SHADOW-001 / SHADOW-002)
    visit(ast, {
      ContractDefinition(contractNode) {
        const stateVars = new Set<string>();
        visit(contractNode, {
          VariableDeclaration(node) {
            if (node.isStateVar && node.name) {
              stateVars.add(node.name);
            }
          },
        });

        visit(contractNode, {
          FunctionDefinition(funcNode) {
            funcNode.parameters.forEach((param) => {
              if (param.name && stateVars.has(param.name)) {
                issues.push({
                  id: "SHADOW-001",
                  severity: "Medium",
                  category: "Variable Shadowing",
                  title: `Function Argument Shadows State Variable: ${param.name}`,
                  description: `The function argument "${param.name}" shadows an existing contract state variable of the same name.`,
                  recommendation:
                    "Rename the function argument (e.g., prefix it with an underscore: _variableName) to prevent shadowing.",
                });
              }
            });

            if (funcNode.body) {
              visit(funcNode.body, {
                VariableDeclaration(localVarNode) {
                  if (
                    !localVarNode.isStateVar &&
                    localVarNode.name &&
                    stateVars.has(localVarNode.name)
                  ) {
                    issues.push({
                      id: "SHADOW-002",
                      severity: "Medium",
                      category: "Variable Shadowing",
                      title: `Local Variable Shadows State Variable: ${localVarNode.name}`,
                      description: `The local variable "${localVarNode.name}" shadows an existing contract state variable of the same name.`,
                      recommendation:
                        "Rename the local variable to avoid naming conflicts with the contract state variable.",
                    });
                  }
                },
              });
            }
          },
        });
      },
    });

    // 9. Gas Optimization (GAS-001)
    if (source.includes("public") && !source.includes("external")) {
      issues.push({
        id: "GAS-001",
        severity: "Informational",
        category: "Gas Optimization",
        title: "Public Functions Could be External",
        description:
          "The contract defines public functions but no external functions. External functions consume less gas when receiving large arrays.",
        recommendation:
          'Use the "external" visibility specifier for functions that are not called internally within the contract.',
      });
    }

    // 10. Parallel EVM Storage Slot Contention Check (MONAD-001)
    visit(ast, {
      ContractDefinition(contractNode) {
        const stateVars = new Set<string>();
        visit(contractNode, {
          VariableDeclaration(node) {
            if (node.isStateVar && node.name) {
              stateVars.add(node.name);
            }
          },
        });

        visit(contractNode, {
          FunctionDefinition(funcNode) {
            if (
              funcNode.stateMutability === "view" ||
              funcNode.stateMutability === "pure" ||
              funcNode.stateMutability === "constant"
            ) {
              return;
            }

            if (!funcNode.body) return;

            visit(funcNode.body, {
              BinaryOperation(binNode) {
                if (["=", "+=", "-="].includes(binNode.operator)) {
                  const left = binNode.left;
                  if (left.type === "Identifier" && stateVars.has(left.name)) {
                    issues.push({
                      id: "MONAD-001",
                      severity: "Medium",
                      category: "Parallel EVM State Contention",
                      title: `Parallel EVM Storage Slot Contention Risk: ${left.name}`,
                      description: `The state variable "${left.name}" is modified inside function "${funcNode.name}". Concurrent transactions writing to this same storage slot will cause scheduling conflicts and speculative execution rollbacks on Monad's parallel execution engine.`,
                      recommendation:
                        "Use address-partitioned mappings (e.g. userBalances[msg.sender]) or off-chain indexers instead of monolithic global counters.",
                    });
                  }
                }
              },
              UnaryOperation(unNode) {
                if (["++", "--"].includes(unNode.operator)) {
                  const sub = unNode.subExpression;
                  if (sub.type === "Identifier" && stateVars.has(sub.name)) {
                    issues.push({
                      id: "MONAD-001",
                      severity: "Medium",
                      category: "Parallel EVM State Contention",
                      title: `Parallel EVM Storage Slot Contention Risk: ${sub.name}`,
                      description: `The state variable "${sub.name}" is modified inside function "${funcNode.name}". Concurrent transactions writing to this same storage slot will cause scheduling conflicts and speculative execution rollbacks on Monad's parallel execution engine.`,
                      recommendation:
                        "Use address-partitioned mappings (e.g. userBalances[msg.sender]) or off-chain indexers instead of monolithic global counters.",
                    });
                  }
                }
              },
            });
          },
        });
      },
    });

    // 11. ECON-001 (Oracle manipulation check)
    let usesGetReserves = false;
    let usesChainlink = false;
    visit(ast, {
      FunctionCall(node) {
        const expression = getCallExpression(node.expression);
        if (expression && expression.type === "MemberAccess") {
          if (expression.memberName === "getReserves") {
            usesGetReserves = true;
          }
          if (expression.memberName === "latestRoundData") {
            usesChainlink = true;
          }
        }
      },
    });

    if (usesGetReserves && !usesChainlink) {
      issues.push({
        id: "ECON-001",
        severity: "High",
        category: "Oracle Price Manipulation",
        title: "Oracle Price Manipulation Risk (Spot Price Usage)",
        description:
          'The contract calls "getReserves" directly to fetch pool states or calculate prices without using a Time-Weighted Average Price (TWAP) or decentralized oracle (e.g., Chainlink, Pyth). Spot price feeds from AMM pools are highly susceptible to flash-loan price manipulation attacks.',
        recommendation:
          "Use a decentralized oracle (e.g. Chainlink, Pyth) or a Time-Weighted Average Price (TWAP) feed to prevent spot price manipulation attacks.",
      });
    }

    // 12. ECON-002 (Unprotected flash-loan callback check)
    visit(ast, {
      FunctionDefinition(funcNode) {
        if (
          funcNode.name === "executeOperation" ||
          funcNode.name === "onFlashLoan" ||
          funcNode.name === "uniswapV2Call"
        ) {
          let checksMsgSender = false;
          if (funcNode.body) {
            visit(funcNode.body, {
              BinaryOperation(binNode) {
                if (binNode.operator === "==") {
                  const left = binNode.left;
                  const right = binNode.right;
                  if (
                    (left.type === "Identifier" &&
                      left.name === "msg.sender") ||
                    (right.type === "Identifier" &&
                      right.name === "msg.sender") ||
                    (left.type === "MemberAccess" &&
                      left.memberName === "sender" &&
                      (left.expression as any).name === "msg") ||
                    (right.type === "MemberAccess" &&
                      right.memberName === "sender" &&
                      (right.expression as any).name === "msg")
                  ) {
                    checksMsgSender = true;
                  }
                }
              },
              MemberAccess(memNode) {
                if (
                  memNode.memberName === "sender" &&
                  (memNode.expression as any).name === "msg"
                ) {
                  checksMsgSender = true;
                }
              },
            });
          }

          if (!checksMsgSender) {
            issues.push({
              id: "ECON-002",
              severity: "Critical",
              category: "Flash Loan Security",
              title: "Unprotected Flash Loan Callback",
              description: `The contract implements the flash loan callback function "${funcNode.name}" but does not verify that the sender (msg.sender) is the expected, trusted lending pool contract. Anyone can call this function to trigger internal logic or drain funds.`,
              recommendation:
                "Add assertions or modifier checks to ensure the callback initiator is the trusted lending pool contract.",
            });
          }
        }
      },
    });

    // 13. ECON-003 (Sandwich Attack Surface — swap without slippage/deadline guard)
    visit(ast, {
      FunctionDefinition(funcNode) {
        if (!funcNode.body) return;
        const funcSrc = source
          .split("\n")
          .slice(
            (funcNode.loc?.start.line ?? 1) - 1,
            funcNode.loc?.end.line ?? 1,
          )
          .join("\n");
        const hasSwap =
          funcSrc.includes("swap") ||
          funcSrc.includes("swapExactTokensForTokens") ||
          funcSrc.includes("exactInputSingle");
        const hasSlippage =
          funcSrc.includes("amountOutMin") ||
          funcSrc.includes("minAmountOut") ||
          funcSrc.includes("sqrtPriceLimitX96") ||
          funcSrc.includes("deadline");
        if (hasSwap && !hasSlippage) {
          issues.push({
            id: "ECON-003",
            severity: "High",
            category: "Sandwich Attack",
            title: `Swap Without Slippage Protection in: ${funcNode.name || "<anonymous>"}`,
            description:
              "A token swap is performed without a minimum output amount (amountOutMin / minAmountOut) or deadline parameter. This makes every trade susceptible to sandwich attacks where MEV bots front-run and back-run the transaction to extract value.",
            recommendation:
              "Always pass an amountOutMin (calculated off-chain) and a block deadline to swap functions. Consider using a slippage-aware aggregator.",
          });
        }
      },
    });

    // 14. ECON-004 (Share inflation — ERC-4626 vault using raw balanceOf for totalAssets)
    {
      let hasTotalAssets = false;
      let usesRawBalanceOf = false;
      visit(ast, {
        FunctionDefinition(funcNode) {
          if (funcNode.name === "totalAssets") {
            hasTotalAssets = true;
            if (funcNode.body) {
              visit(funcNode.body, {
                FunctionCall(callNode) {
                  const expr = getCallExpression(callNode.expression);
                  if (
                    expr &&
                    expr.type === "MemberAccess" &&
                    expr.memberName === "balanceOf"
                  ) {
                    usesRawBalanceOf = true;
                  }
                },
              });
            }
          }
        },
      });
      if (hasTotalAssets && usesRawBalanceOf) {
        issues.push({
          id: "ECON-004",
          severity: "High",
          category: "Share Inflation",
          title: "ERC-4626 totalAssets Uses Raw balanceOf (Donation Attack)",
          description:
            "The totalAssets() function reads token balance via balanceOf(address(this)) directly. An attacker can donate tokens to the vault before the first deposit, inflating the share price and causing subsequent depositors to receive 0 shares (share inflation / first-depositor attack).",
          recommendation:
            "Track deposited assets in a dedicated internal accounting variable (e.g., uint256 private _totalDeposited) and return that instead of the raw balanceOf value in totalAssets().",
        });
      }
    }

    // 15. ECON-005 (Unchecked token decimals — dangerous decimal arithmetic)
    visit(ast, {
      BinaryOperation(binNode) {
        if (binNode.operator === "**") {
          const right = binNode.right;
          // Detect: 10 ** token.decimals() used directly in arithmetic without assignment to a normalized var
          if (
            right.type === "FunctionCall" &&
            right.expression &&
            (right.expression as any).type === "MemberAccess" &&
            (right.expression as any).memberName === "decimals"
          ) {
            issues.push({
              id: "ECON-005",
              severity: "Medium",
              category: "Decimal Precision",
              title: "Unchecked Token Decimals in Arithmetic",
              description:
                "The contract calls token.decimals() inline within an arithmetic expression (e.g., 10 ** token.decimals()). Non-standard tokens may return unexpected decimal values (0 or >18), causing silent under/overflow in price calculations or amount normalizations.",
              recommendation:
                "Cache the decimal value in a local variable, validate it is within a safe range (e.g., 6 <= decimals <= 18), then use it in arithmetic.",
            });
          }
        }
      },
    });

    // 16. Upgradeability Checks
    const isUpgradeable =
      source.includes("Upgradeable") ||
      source.includes("Initializable") ||
      source.includes("initializer");

    if (isUpgradeable) {
      // UPGRADE-001: Unsafe Constructor
      visit(ast, {
        FunctionDefinition(node: any) {
          if (!node.isConstructor) return;
          let hasStateChanges = false;
          let disablesInitializers = false;

          if (node.body && node.body.statements) {
            node.body.statements.forEach((stmt: any) => {
              if (
                stmt.type === "ExpressionStatement" &&
                stmt.expression.type === "FunctionCall" &&
                stmt.expression.expression.type === "Identifier" &&
                stmt.expression.expression.name === "_disableInitializers"
              ) {
                disablesInitializers = true;
              } else {
                hasStateChanges = true;
              }
            });
          }

          if (hasStateChanges || !disablesInitializers) {
            issues.push({
              id: "UPGRADE-001",
              severity: "Critical",
              category: "Upgradeability",
              title: "Unsafe Constructor in Upgradeable Contract",
              description:
                "Upgradeable contracts must not have constructors that assign state variables or perform initial setup. They must use initializer functions, and the constructor should only call _disableInitializers() to protect the implementation contract.",
              recommendation:
                "Replace constructor logic with an initialize() function and add a constructor that calls _disableInitializers().",
            });
          }
        },
      });

      // UPGRADE-002: Unsafe State Variable Initialization
      visit(ast, {
        StateVariableDeclaration(node: any) {
          node.variables.forEach((variable: any) => {
            if (
              variable.expression &&
              !variable.isDeclaredConst &&
              !variable.isImmutable
            ) {
              issues.push({
                id: "UPGRADE-002",
                severity: "High",
                category: "Upgradeability",
                title: "State Variable Initialized at Declaration",
                description: `The state variable "${variable.name}" is initialized at declaration. In upgradeable contracts, these initial values are not set in the proxy's storage during deployment.`,
                recommendation: `Remove the initialization at declaration, and set the value of "${variable.name}" inside the initialize() function instead.`,
              });
            }
          });
        },
      });

      // UPGRADE-003: Unsafe selfdestruct / delegatecall
      visit(ast, {
        FunctionCall(node: any) {
          const expr = getCallExpression(node.expression);
          if (expr) {
            if (
              expr.type === "Identifier" &&
              (expr.name === "selfdestruct" || expr.name === "suicide")
            ) {
              issues.push({
                id: "UPGRADE-003",
                severity: "Critical",
                category: "Upgradeability",
                title: "Unsafe selfdestruct Call in Upgradeable Contract",
                description:
                  "The contract contains a selfdestruct or suicide call. If a malicious actor triggers selfdestruct on the implementation contract, the proxy will be permanently bricked.",
                recommendation: "Remove selfdestruct/suicide logic entirely.",
              });
            } else if (
              expr.type === "MemberAccess" &&
              expr.memberName === "delegatecall"
            ) {
              issues.push({
                id: "UPGRADE-003",
                severity: "Critical",
                category: "Upgradeability",
                title: "Unsafe delegatecall Call in Upgradeable Contract",
                description:
                  "The contract executes an external delegatecall. If an implementation contract delegatecalls into a malicious target, it can execute selfdestruct and destroy the implementation.",
                recommendation:
                  "Avoid delegatecall in upgradeable contracts, or restrict targets to validated, trusted contracts.",
              });
            }
          }
        },
      });
    }
  }

  /**
   * Regex-based fallback static analysis checks.
   */
  private runRegexAudit(contractSource: string, issues: AuditIssue[]): void {
    // Strip comments to prevent false positives/negatives in regex matches
    contractSource = contractSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");

    // 1. Compiler Version / Missing Pragma
    const pragmaMatch = contractSource.match(/pragma solidity\s+([^;]+);/);
    if (pragmaMatch) {
      const versionString = pragmaMatch[1].trim();
      if (
        versionString.includes("0.7") ||
        versionString.includes("0.6") ||
        versionString.includes("0.5")
      ) {
        issues.push({
          id: "OVERFLOW-001",
          severity: "High",
          category: "Integer Overflow",
          title: "Outdated Compiler Version (Integer Overflow Risk)",
          description: `The contract uses compiler version ${versionString}. Solidity versions below 0.8.0 do not have overflow checks enabled by default.`,
          recommendation:
            "Upgrade to Solidity 0.8.0 or newer, or use OpenZeppelin SafeMath library.",
        });
      }
    } else {
      issues.push({
        id: "PRAGMA-001",
        severity: "Medium",
        category: "Syntax validation",
        title: "Missing Compiler Pragma Directive",
        description:
          "No pragma solidity version defined in the contract source code.",
        recommendation:
          'Add "pragma solidity ^0.8.20;" at the top of your Solidity files.',
      });
    }

    // 2. Access Control / Unprotected Sensitive Functions
    const stateChangingFuncs =
      contractSource.match(
        /function\s+(\w+)\s*\([^)]*\)\s*(public|external)[^{]*/g,
      ) || [];
    for (const func of stateChangingFuncs) {
      const funcName = func.match(/function\s+(\w+)/)?.[1] || "";
      const sensitiveNames = [
        "mint",
        "burn",
        "withdraw",
        "pause",
        "transferOwnership",
        "setReward",
      ];
      const isSensitive = sensitiveNames.some((name) =>
        funcName.toLowerCase().includes(name),
      );

      if (isSensitive) {
        const hasGuard =
          func.includes("onlyOwner") ||
          func.includes("onlyRole") ||
          func.includes("hasRole");
        if (!hasGuard) {
          issues.push({
            id: "ACCESS-001",
            severity: "Critical",
            category: "Access Control",
            title: `Unprotected Sensitive Function: ${funcName}`,
            description: `The function "${funcName}" is marked public or external but does not appear to contain access control modifiers like "onlyOwner" or "onlyRole".`,
            recommendation:
              "Add appropriate access control modifiers or internal authorization checks.",
          });
        }
      }
    }

    // 3. Reentrancy warning
    const containsExternalCall =
      contractSource.includes(".call{") ||
      contractSource.includes(".transfer(") ||
      contractSource.includes(".send(");
    const containsStateUpdateAfterCall =
      /call\{[\s\S]*?\n\s*\w+\s*\[.*?\]\s*=\s*/.test(contractSource);
    const hasReentrancyGuard = contractSource.includes("nonReentrant");

    if (containsExternalCall && !hasReentrancyGuard) {
      issues.push({
        id: "REENTRANCY-001",
        severity: "High",
        category: "Reentrancy",
        title: "External Call without ReentrancyGuard",
        description:
          'The contract makes low-level calls or ether transfers but does not inherit from ReentrancyGuard or apply "nonReentrant" modifier to the function.',
        recommendation:
          'Inherit from OpenZeppelin ReentrancyGuard and apply "nonReentrant" modifier to all state-changing functions performing external calls.',
      });
    }

    if (containsStateUpdateAfterCall) {
      issues.push({
        id: "REENTRANCY-002",
        severity: "Critical",
        category: "Reentrancy",
        title: "State Variable Update after External Call",
        description:
          "A state variable appears to be modified after an external call instruction, creating a potential reentrancy vulnerability.",
        recommendation:
          "Apply the checks-effects-interactions pattern: update state variables before making external calls.",
      });
    }

    // 4. Dangerous Low-Level Calls
    const uncheckedCallMatches =
      contractSource.match(/(\w+)\.call\{[^}]*\}/g) || [];
    for (const match of uncheckedCallMatches) {
      const index = contractSource.indexOf(match);
      const surroundingContext = contractSource.substring(
        Math.max(0, index - 20),
        index,
      );
      const isAssigned =
        surroundingContext.includes("bool") ||
        surroundingContext.includes("=") ||
        surroundingContext.includes("require(");

      if (!isAssigned) {
        issues.push({
          id: "CALL-001",
          severity: "High",
          category: "Dangerous External Call",
          title: "Unchecked Return Value of Low-Level Call",
          description:
            "A low-level call is executed but its return value (success boolean) is not captured or validated.",
          recommendation:
            "Always check the return value of low-level calls: (bool success, ) = target.call(...); require(success);",
        });
      }
    }

    // 5. Gas Optimization
    if (
      contractSource.includes("public") &&
      !contractSource.includes("external")
    ) {
      issues.push({
        id: "GAS-001",
        severity: "Informational",
        category: "Gas Optimization",
        title: "Public Functions Could be External",
        description:
          "The contract defines public functions but no external functions. External functions consume less gas when receiving large arrays.",
        recommendation:
          'Use the "external" visibility specifier for functions that are not called internally within the contract.',
      });
    }

    // 6. tx.origin Authorization Check
    if (contractSource.includes("tx.origin")) {
      const originMatches =
        contractSource.match(/require\([^)]*tx\.origin[^)]*\)/g) ||
        contractSource.match(/if\s*\([^)]*tx\.origin[^)]*\)/g) ||
        [];
      if (originMatches.length > 0) {
        issues.push({
          id: "TX-ORIGIN-001",
          severity: "Critical",
          category: "Authorization bypass",
          title: "Authorization via tx.origin",
          description:
            "Using tx.origin for authorization checks makes the contract vulnerable to phishing attacks (reentrancy/caller spoofing via malicious contracts).",
          recommendation:
            'Replace "tx.origin" authorization checks with "msg.sender".',
        });
      }
    }

    // 7. Unsafe ERC20 Transfer
    const transferMatches =
      contractSource.match(/(\w+|\))\.(transfer|transferFrom)\s*\([^)]*\)/g) ||
      [];
    for (const match of transferMatches) {
      const index = contractSource.indexOf(match);
      const surroundingBefore = contractSource.substring(
        Math.max(0, index - 30),
        index,
      );
      const isDecl =
        surroundingBefore.includes("function") ||
        surroundingBefore.includes("event");
      const isHandled =
        surroundingBefore.includes("require(") ||
        surroundingBefore.includes("if(") ||
        surroundingBefore.includes("if (") ||
        surroundingBefore.includes("=") ||
        surroundingBefore.includes("return");

      if (!isDecl && !isHandled) {
        issues.push({
          id: "ERC20-TRANSFER-001",
          severity: "High",
          category: "Unsafe ERC20 Operation",
          title: "Unchecked ERC20 Transfer Return Value",
          description:
            "The return value of an ERC20 token transfer or transferFrom call is unchecked. Some tokens return false on failure instead of reverting.",
          recommendation:
            "Use OpenZeppelin's SafeERC20 library or wrap the transfer call in a require statement: require(token.transfer(to, amount));",
        });
      }
    }

    // 8. block.timestamp Dependency
    if (
      contractSource.includes("block.timestamp") ||
      contractSource.includes(" now")
    ) {
      const randMatches =
        contractSource.match(
          /keccak256\s*\(\s*abi\.encodePacked\s*\([^)]*(block\.timestamp|now)[^)]*\)\)/g,
        ) || [];
      if (randMatches.length > 0) {
        issues.push({
          id: "TIMESTAMP-001",
          severity: "High",
          category: "Weak Randomness",
          title: "Weak Randomness from block.timestamp",
          description:
            "The contract uses block.timestamp (or now) as a seed for randomness. Block timestamps can be manipulated by miners within certain limits.",
          recommendation:
            "Use Chainlink VRF (Verifiable Random Function) or other secure sources of randomness.",
        });
      } else {
        const timingMatches =
          contractSource.match(/(==|!=|>|<|>=|<=)\s*(block\.timestamp|now)/g) ||
          contractSource.match(/(block\.timestamp|now)\s*(==|!=|>|<|>=|<=)/g) ||
          [];
        if (timingMatches.length > 0) {
          issues.push({
            id: "TIMESTAMP-002",
            severity: "Low",
            category: "Timestamp Dependency",
            title: "Timestamp Dependency for Timing Logic",
            description:
              "The contract relies on block.timestamp for comparisons. Miners can influence block timestamps slightly, which can affect precise timing logic.",
            recommendation:
              "Avoid relying on exact block timestamps for high-precision time checks. Tolerances should account for up to 15-second drifts.",
          });
        }
      }
    }

    // 9. State Variable Shadowing
    const stateVarRegex =
      /(uint256|address|bool|string|bytes32|int256)\s+(public|private|internal|external)?\s*(\w+)\s*(?:=[\s\S]*?)?;/g;
    const stateVars: string[] = [];
    let stateVarMatch;
    const beforeFunctions = contractSource.split(/function/)[0] || "";
    while ((stateVarMatch = stateVarRegex.exec(beforeFunctions)) !== null) {
      const varName = stateVarMatch[3];
      if (varName && !stateVars.includes(varName)) {
        stateVars.push(varName);
      }
    }

    if (stateVars.length > 0) {
      const funcRegex = /function\s+\w+\s*\(([^)]*)\)[^{]*{([\s\S]*?)}/g;
      let funcMatch;
      while ((funcMatch = funcRegex.exec(contractSource)) !== null) {
        const argsStr = funcMatch[1];
        const bodyStr = funcMatch[2];

        const args = argsStr
          .split(",")
          .map((arg) => arg.trim().split(/\s+/).pop() || "");
        for (const arg of args) {
          if (arg && stateVars.includes(arg)) {
            issues.push({
              id: "SHADOW-001",
              severity: "Medium",
              category: "Variable Shadowing",
              title: `Function Argument Shadows State Variable: ${arg}`,
              description: `The function argument "${arg}" shadows an existing contract state variable of the same name.`,
              recommendation:
                "Rename the function argument (e.g., prefix it with an underscore: _variableName) to prevent shadowing.",
            });
          }
        }

        const localVarRegex =
          /(uint256|address|bool|string|bytes32|int256)\s+(?:memory|calldata|storage)?\s*(\w+)\s*(?:=[\s\S]*?)?;/g;
        let localVarMatch;
        while ((localVarMatch = localVarRegex.exec(bodyStr)) !== null) {
          const varName = localVarMatch[2];
          if (varName && stateVars.includes(varName)) {
            issues.push({
              id: "SHADOW-002",
              severity: "Medium",
              category: "Variable Shadowing",
              title: `Local Variable Shadows State Variable: ${varName}`,
              description: `The local variable "${varName}" shadows an existing contract state variable of the same name.`,
              recommendation:
                "Rename the local variable to avoid naming conflicts with the contract state variable.",
            });
          }
        }
      }
    }

    // 10. Monad Parallel EVM Storage Slot Contention Check (MONAD-001)
    if (stateVars.length > 0) {
      const monadFuncRegex = /function\s+(\w+)\s*\(([^)]*)\)[^{]*{([\s\S]*?)}/g;
      let monadFuncMatch;
      while ((monadFuncMatch = monadFuncRegex.exec(contractSource)) !== null) {
        const fullSig = monadFuncMatch[0];
        const funcName = monadFuncMatch[1];
        const argsStr = monadFuncMatch[2];
        const bodyStr = monadFuncMatch[3];

        if (
          fullSig.includes(" view ") ||
          fullSig.includes(" pure ") ||
          fullSig.includes("constant")
        ) {
          continue;
        }

        const args = argsStr
          .split(",")
          .map((arg) => arg.trim().split(/\s+/).pop() || "");
        for (const varName of stateVars) {
          const assignRegex = new RegExp(
            `\\b${varName}\\b\\s*(\\+=|-=|\\+\\+|--|=)(?![=])`,
          );
          if (assignRegex.test(bodyStr)) {
            const isLocalShadow =
              bodyStr.includes(`memory ${varName}`) ||
              bodyStr.includes(`storage ${varName}`) ||
              bodyStr.includes(`calldata ${varName}`);
            const isArgShadow = args.includes(varName);
            if (!isLocalShadow && !isArgShadow) {
              issues.push({
                id: "MONAD-001",
                severity: "Medium",
                category: "Parallel EVM State Contention",
                title: `Parallel EVM Storage Slot Contention Risk: ${varName}`,
                description: `The state variable "${varName}" is modified inside function "${funcName}". Concurrent transactions writing to this same storage slot will cause scheduling conflicts and speculative execution rollbacks on Monad's parallel execution engine.`,
                recommendation:
                  "Use address-partitioned mappings (e.g. userBalances[msg.sender]) or off-chain indexers instead of monolithic global counters.",
              });
            }
          }
        }
      }
    }

    // 11. ECON-001 (Oracle manipulation check)
    if (
      contractSource.includes("getReserves") &&
      !contractSource.includes("latestRoundData")
    ) {
      issues.push({
        id: "ECON-001",
        severity: "High",
        category: "Oracle Price Manipulation",
        title: "Oracle Price Manipulation Risk (Spot Price Usage)",
        description:
          'The contract calls "getReserves" directly to fetch pool states or calculate prices without using a Time-Weighted Average Price (TWAP) or decentralized oracle (e.g., Chainlink, Pyth). Spot price feeds from AMM pools are highly susceptible to flash-loan price manipulation attacks.',
        recommendation:
          "Use a decentralized oracle (e.g. Chainlink, Pyth) or a Time-Weighted Average Price (TWAP) feed to prevent spot price manipulation attacks.",
      });
    }

    // 12. ECON-002 (Unprotected flash-loan callback check)
    if (
      contractSource.includes("function executeOperation") ||
      contractSource.includes("function onFlashLoan") ||
      contractSource.includes("function uniswapV2Call")
    ) {
      if (!contractSource.includes("msg.sender")) {
        issues.push({
          id: "ECON-002",
          severity: "Critical",
          category: "Flash Loan Security",
          title: "Unprotected Flash Loan Callback",
          description:
            "The contract implements a flash loan callback function but does not verify that the sender (msg.sender) is the expected, trusted lending pool contract. Anyone can call this function to trigger internal logic or drain funds.",
          recommendation:
            "Add assertions or modifier checks to ensure the callback initiator is the trusted lending pool contract.",
        });
      }
    }

    // 13. ECON-003 (Sandwich attack — swap without slippage/deadline)
    const swapKeywords = [
      "swap",
      "swapExactTokensForTokens",
      "exactInputSingle",
    ];
    const slippageKeywords = [
      "amountOutMin",
      "minAmountOut",
      "sqrtPriceLimitX96",
      "deadline",
    ];
    const hasSwapInSource = swapKeywords.some((k) =>
      contractSource.includes(k),
    );
    const hasSlippageInSource = slippageKeywords.some((k) =>
      contractSource.includes(k),
    );
    if (hasSwapInSource && !hasSlippageInSource) {
      issues.push({
        id: "ECON-003",
        severity: "High",
        category: "Sandwich Attack",
        title: "Swap Without Slippage Protection",
        description:
          "A token swap is performed without a minimum output amount (amountOutMin / minAmountOut) or deadline parameter. This makes every trade susceptible to sandwich attacks where MEV bots front-run and back-run the transaction to extract value.",
        recommendation:
          "Always pass an amountOutMin (calculated off-chain) and a block deadline to swap functions. Consider using a slippage-aware aggregator.",
      });
    }

    // 14. ECON-004 (ERC-4626 share inflation — totalAssets using raw balanceOf)
    if (
      contractSource.includes("function totalAssets") &&
      contractSource.includes("balanceOf(address(this))") &&
      !contractSource.includes("_totalDeposited") &&
      !contractSource.includes("_internalBalance")
    ) {
      issues.push({
        id: "ECON-004",
        severity: "High",
        category: "Share Inflation",
        title: "ERC-4626 totalAssets Uses Raw balanceOf (Donation Attack)",
        description:
          "The totalAssets() function reads token balance via balanceOf(address(this)) directly. An attacker can donate tokens to the vault before the first deposit, inflating the share price and causing subsequent depositors to receive 0 shares (share inflation / first-depositor attack).",
        recommendation:
          "Track deposited assets in a dedicated internal accounting variable (e.g., uint256 private _totalDeposited) and return that instead of the raw balanceOf value in totalAssets().",
      });
    }

    // 15. ECON-005 (Unchecked token decimals inline arithmetic)
    if (/\d+\s*\*\*\s*\w+\.decimals\s*\(\s*\)/.test(contractSource)) {
      issues.push({
        id: "ECON-005",
        severity: "Medium",
        category: "Decimal Precision",
        title: "Unchecked Token Decimals in Arithmetic",
        description:
          "The contract calls token.decimals() inline within an arithmetic expression (e.g., 10 ** token.decimals()). Non-standard tokens may return unexpected decimal values (0 or >18), causing silent under/overflow in price calculations or amount normalizations.",
        recommendation:
          "Cache the decimal value in a local variable, validate it is within a safe range (e.g., 6 <= decimals <= 18), then use it in arithmetic.",
      });
    }

    // 16. Upgradeability checks
    const isUpgradeableSource =
      contractSource.includes("Upgradeable") ||
      contractSource.includes("Initializable") ||
      contractSource.includes("initializer");

    if (isUpgradeableSource) {
      // UPGRADE-001 (Constructor check)
      if (
        contractSource.includes("constructor") &&
        !contractSource.includes("_disableInitializers")
      ) {
        issues.push({
          id: "UPGRADE-001",
          severity: "Critical",
          category: "Upgradeability",
          title: "Unsafe Constructor in Upgradeable Contract",
          description:
            "Upgradeable contracts must not have constructors that assign state variables or perform initial setup. They must use initializer functions, and the constructor should only call _disableInitializers() to protect the implementation contract.",
          recommendation:
            "Replace constructor logic with an initialize() function and add a constructor that calls _disableInitializers().",
        });
      }

      // UPGRADE-002 (State Variable Initialization)
      const varInitRegex =
        /(uint256|uint128|uint64|uint32|uint|int256|int128|int|address|string|bool)\s+(?!constant|immutable)(public|private|internal)?\s*\w+\s*=\s*[^;]+;/;
      if (varInitRegex.test(contractSource)) {
        issues.push({
          id: "UPGRADE-002",
          severity: "High",
          category: "Upgradeability",
          title: "State Variable Initialized at Declaration",
          description:
            "A state variable is initialized at declaration in an upgradeable contract. In upgradeable contracts, these initial values are not set in the proxy's storage during deployment.",
          recommendation:
            "Remove the initialization at declaration, and set the value inside the initialize() function instead.",
        });
      }

      // UPGRADE-003 (selfdestruct / delegatecall check)
      if (
        contractSource.includes("selfdestruct") ||
        contractSource.includes("suicide")
      ) {
        issues.push({
          id: "UPGRADE-003",
          severity: "Critical",
          category: "Upgradeability",
          title: "Unsafe selfdestruct Call in Upgradeable Contract",
          description:
            "The contract contains a selfdestruct or suicide call. If a malicious actor triggers selfdestruct on the implementation contract, the proxy will be permanently bricked.",
          recommendation: "Remove selfdestruct/suicide logic entirely.",
        });
      } else if (contractSource.includes(".delegatecall")) {
        issues.push({
          id: "UPGRADE-003",
          severity: "Critical",
          category: "Upgradeability",
          title: "Unsafe delegatecall Call in Upgradeable Contract",
          description:
            "The contract executes an external delegatecall. If an implementation contract delegatecalls into a malicious target, it can execute selfdestruct and destroy the implementation.",
          recommendation:
            "Avoid delegatecall in upgradeable contracts, or restrict targets to validated, trusted contracts.",
        });
      }
    }
  }
}
export default AuditEngine;
