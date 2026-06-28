export interface Deployment {
  id: string;
  projectId: string;
  network: string; // e.g. "monad-testnet", "local"
  contractAddress: string;
  transactionHash: string;
  status: string; // e.g. "pending", "success", "failed"
  createdAt: Date;
}

export interface AuditReport {
  id: string;
  projectId: string;
  riskScore: number; // 0 to 100
  report: AuditReportDetails;
  createdAt: Date;
}

export interface AuditIssue {
  id: string;
  severity: "Critical" | "High" | "Medium" | "Low" | "Informational";
  category: string; // e.g. "Reentrancy", "Access Control"
  title: string;
  description: string;
  recommendation: string;
  location?: string; // e.g. "contracts/Token.sol:23-28"
}

export interface AuditReportDetails {
  issues: AuditIssue[];
  recommendations: string[];
}

export interface ExecutionLog {
  id: string;
  requestId?: string;
  module: string;
  severity: "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  message: string;
  timestamp: Date;
}

// Engine Interfaces (Contracts)
export interface IKnowledgeEngine {
  search(query: string): Promise<SearchResult>;
  ingestDocs(docs: DocSource[]): Promise<void>;
}

export interface SearchResult {
  topMatches: Match[];
  confidenceScore: number;
  sourceDocuments: string[];
}

export interface Match {
  id: string;
  title: string;
  source: string;
  content: string;
  score: number;
}

export interface DocSource {
  title: string;
  source: string;
  content: string;
}

export interface ITemplateEngine {
  generateProject(
    name: string,
    symbol: string,
    templateType: string,
    options?: Record<string, any>,
  ): Promise<GeneratedProject>;
}

export interface GeneratedProject {
  contracts: Record<string, string>; // path -> code
  tests: Record<string, string>; // path -> code
  deploymentScripts: Record<string, string>; // path -> code
  readme: string;
  envExample: string;
}

export interface PrimitiveOutput<T = any> {
  status: "success" | "failure";
  action: string;
  txHash?: string;
  stateChange?: Record<string, any>;
  metadata: T;
}

export interface IDeploymentEngine {
  compile(
    projectFiles: Record<string, string>,
  ): Promise<PrimitiveOutput<CompilationResult>>;
  deployToTestnet(
    compiledArtifact: PrimitiveOutput<CompilationResult>,
    deployerPrivateKey: string,
  ): Promise<PrimitiveOutput<DeploymentResult>>;
  deployUpgradeable(
    implementationArtifact: PrimitiveOutput<CompilationResult>,
    deployerPrivateKey: string,
    initializerArgs?: any[],
    initializerMethod?: string,
  ): Promise<
    PrimitiveOutput<
      DeploymentResult & { proxyAddress: string; implementationAddress: string }
    >
  >;
  verifyDeployment(
    contractAddress: string,
    sourceCode: string,
    options?: Record<string, any>,
  ): Promise<PrimitiveOutput<VerificationResult>>;
  rollbackDeployment(txHash: string): Promise<void>;
}

export interface CompilationResult {
  success: boolean;
  abi: any;
  bytecode: string;
  errors?: string[];
  sources?: Record<string, string>;
}

export interface DeploymentResult {
  contractAddress: string;
  transactionHash: string;
  gasUsed: string;
  status: "success" | "failed";
  errors?: string[];
  verificationStatus?: string;
  verificationMessage?: string;
  implementationVerificationStatus?: string;
  implementationVerificationMessage?: string;
}

export interface VerificationResult {
  success: boolean;
  message: string;
}

export interface IWalletEngine {
  createWallet(): Promise<WalletCredentials>;
  importWallet(privateKey: string): Promise<WalletCredentials>;
  signTransaction(txPayload: any, privateKey: string): Promise<string>;
  sendTransaction(signedTx: string): Promise<string>;
}

export interface WalletCredentials {
  address: string;
  privateKey: string;
}

export interface IAuditEngine {
  runAudit(
    contractSource: string,
  ): Promise<AuditReportDetails & { riskScore: number }>;
}
