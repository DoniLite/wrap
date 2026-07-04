import { format } from "date-fns";
import * as util from "util";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  requestId?: string;
  className?: string;
  methodName?: string;
  [key: string]: unknown;
}

const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[44m", // Background blue for explicit visibility? No, standard text blue.
  blueText: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = "debug";

  private constructor() {
    const envLevel = process.env.LOG_LEVEL as LogLevel;
    if (envLevel) {
      this.logLevel = envLevel;
    }
  }

  public static getInstance(withLevel?: LogLevel): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    if (withLevel) {
      Logger.instance.level = withLevel;
    }
    return Logger.instance;
  }

  public get level(): string {
    return this.logLevel;
  }

  public set level(level: LogLevel) {
    this.logLevel = level;
  }

  private getLevelColor(level: LogLevel): string {
    switch (level) {
      case "debug":
        return colors.blueText;
      case "info":
        return colors.green;
      case "warn":
        return colors.yellow;
      case "error":
        return colors.red;
      default:
        return colors.reset;
    }
  }

  private formatMessage(
    level: LogLevel,
    message: string,
    context?: LogContext,
  ): string {
    const timestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss.SSS");
    const levelColor = this.getLevelColor(level);
    const levelStr = level.toUpperCase().padEnd(5, " ");

    // Header: [TIMESTAMP] LEVEL
    let formatted = `${colors.gray}[${timestamp}]${colors.reset} ${levelColor}${levelStr}${colors.reset}`;

    // Add context tags if present (e.g. [className] or [method=GET])
    // We can extract specific important context keys to show inline, and put the rest in a detailed view
    const inlineContext: string[] = [];
    const remainingContext = { ...context };

    if (remainingContext.requestId) {
      // inlineContext.push(`[${remainingContext.requestId}]`); // Request ID is often long, maybe skip inline or shorten?
      delete remainingContext.requestId;
    }

    // For HTTP logs specifically
    if (remainingContext.method && remainingContext.path) {
      const method = remainingContext.method;
      const path = remainingContext.path;
      const status = remainingContext.status
        ? ` ${remainingContext.status}`
        : "";
      const duration = remainingContext.duration
        ? ` (${remainingContext.duration}ms)`
        : "";
      inlineContext.push(
        `${colors.magenta}${method} ${path}${status}${duration}${colors.reset}`,
      );

      delete remainingContext.method;
      delete remainingContext.path;
      delete remainingContext.status;
      delete remainingContext.duration;
    }

    if (remainingContext.className) {
      inlineContext.push(
        `${colors.cyan}[${remainingContext.className}]${colors.reset}`,
      );
      delete remainingContext.className;
    }

    const inlineStr =
      inlineContext.length > 0 ? ` ${inlineContext.join(" ")}` : "";

    formatted += `${inlineStr} ${message}`;

    // If there is significant remaining context (like SQL query), append it on new lines
    const remainingKeys = Object.keys(remainingContext);
    if (remainingKeys.length > 0) {
      // Check for SQL logs to format them nicely
      if (remainingContext.query) {
        formatted += `\n${colors.dim}  Query:${colors.reset} ${colors.cyan}${remainingContext.query}${colors.reset}`;
        delete remainingContext.query;
        if (remainingContext.params) {
          formatted += `\n${colors.dim}  Params:${colors.reset} ${util.inspect(remainingContext.params, { colors: true, breakLength: Infinity, compact: true })}`;
          delete remainingContext.params;
        }
      }

      // Print anything else left in context
      if (Object.keys(remainingContext).length > 0) {
        formatted += `\n${colors.dim}  Context:${colors.reset} ${util.inspect(remainingContext, { colors: true, depth: null, breakLength: 80, compact: false }).replace(/\n/g, "\n  ")}`;
      }
    }

    return formatted;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  public debug(message: string, context?: LogContext, data?: unknown) {
    if (this.shouldLog("debug")) {
      console.debug(this.formatMessage("debug", message, context));
      if (data) {
        console.debug(
          `${colors.dim}  Data:${colors.reset}`,
          util.inspect(data, { colors: true, depth: null }),
        );
      }
    }
  }

  public info(message: string, context?: LogContext, data?: unknown) {
    if (this.shouldLog("info")) {
      console.info(this.formatMessage("info", message, context));
      if (data) {
        console.info(
          `${colors.dim}  Data:${colors.reset}`,
          util.inspect(data, { colors: true, depth: null }),
        );
      }
    }
  }

  public warn(message: string, context?: LogContext, data?: unknown) {
    if (this.shouldLog("warn")) {
      console.warn(this.formatMessage("warn", message, context));
      if (data) {
        console.warn(
          `${colors.dim}  Data:${colors.reset}`,
          util.inspect(data, { colors: true, depth: null }),
        );
      }
    }
  }

  public error(message: string, context?: LogContext, error?: unknown) {
    if (this.shouldLog("error")) {
      console.error(this.formatMessage("error", message, context));
      if (error) {
        if (error instanceof Error) {
          console.error(error.stack);
        } else {
          console.error(
            `${colors.dim}  Error:${colors.reset}`,
            util.inspect(error, { colors: true }),
          );
        }
      }
    }
  }
}

export const logger = Logger.getInstance();
