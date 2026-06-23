import { AsyncLocalStorage } from "async_hooks";

export type LogSeverity = "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";

export interface LogContext {
  requestId?: string;
  projectId?: string;
  module?: string;
}

export const logContextStorage = new AsyncLocalStorage<LogContext>();

export interface LogPayload {
  timestamp: string;
  requestId?: string;
  projectId?: string;
  module: string;
  operation?: string;
  duration?: number;
  status?: string;
  severity: LogSeverity;
  message: string;
  error?: any;
}

const SEVERITY_LEVELS: Record<LogSeverity, number> = {
  DEBUG: 0,
  INFO: 1,
  WARNING: 2,
  ERROR: 3,
  CRITICAL: 4,
};

function getMinLogLevel(): number {
  const envLevel = (
    process.env.LOG_LEVEL || "INFO"
  ).toUpperCase() as LogSeverity;
  return SEVERITY_LEVELS[envLevel] !== undefined
    ? SEVERITY_LEVELS[envLevel]
    : 1;
}

export class Logger {
  private moduleName: string;

  constructor(moduleName: string) {
    this.moduleName = moduleName;
  }

  private log(
    severity: LogSeverity,
    message: string,
    meta?: {
      operation?: string;
      duration?: number;
      status?: string;
      error?: any;
      projectId?: string;
      requestId?: string;
    },
  ) {
    const minLevel = getMinLogLevel();
    const currentLevel = SEVERITY_LEVELS[severity];
    if (currentLevel < minLevel) return;

    const context = logContextStorage.getStore() || {};
    const payload: LogPayload = {
      timestamp: new Date().toISOString(),
      module: context.module || this.moduleName,
      severity,
      message,
    };

    // Inject contextual variables
    if (context.requestId || meta?.requestId) {
      payload.requestId = meta?.requestId || context.requestId;
    }
    if (context.projectId || meta?.projectId) {
      payload.projectId = meta?.projectId || context.projectId;
    }
    if (meta?.operation) {
      payload.operation = meta.operation;
    }
    if (meta?.duration !== undefined) {
      payload.duration = meta.duration;
    }
    if (meta?.status) {
      payload.status = meta.status;
    }
    if (meta?.error) {
      payload.error =
        meta.error instanceof Error
          ? {
              name: meta.error.name,
              message: meta.error.message,
              stack: meta.error.stack,
            }
          : meta.error;
    }

    const logString = JSON.stringify(payload);
    if (currentLevel >= SEVERITY_LEVELS.ERROR) {
      console.error(logString);
    } else {
      console.log(logString);
    }
  }

  public debug(message: string, meta?: Parameters<Logger["log"]>[2]) {
    this.log("DEBUG", message, meta);
  }

  public info(message: string, meta?: Parameters<Logger["log"]>[2]) {
    this.log("INFO", message, meta);
  }

  public warn(message: string, meta?: Parameters<Logger["log"]>[2]) {
    this.log("WARNING", message, meta);
  }

  public error(
    message: string,
    error?: any,
    meta?: Parameters<Logger["log"]>[2],
  ) {
    this.log("ERROR", message, { ...meta, error });
  }

  public critical(
    message: string,
    error?: any,
    meta?: Parameters<Logger["log"]>[2],
  ) {
    this.log("CRITICAL", message, { ...meta, error });
  }
}

export const createLogger = (moduleName: string) => new Logger(moduleName);
