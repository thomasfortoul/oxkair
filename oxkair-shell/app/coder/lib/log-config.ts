/**
 * Log Configuration Management
 * 
 * Manages configuration for file-based logging including environment variable
 * reading, default values, and validation.
 */

import { LogLevel } from './logging.ts';

export interface LogConfig {
  fileLoggingEnabled: boolean;
  logDirectory: string;
  logLevel: LogLevel;
  customLogPath?: string;
  maxFileSize?: number;
  rotateFiles?: boolean;
}

export class LogConfigManager {
  private static config: LogConfig | null = null;

  /**
   * Gets the current log configuration, initializing it if necessary.
   */
  static getConfig(): LogConfig {
    if (!this.config) {
      this.config = this.loadConfig();
    }
    return this.config;
  }

  /**
   * Loads configuration from environment variables with fallback defaults.
   */
  private static loadConfig(): LogConfig {
    const isVercel = process.env.VERCEL === '1';

    return {
      fileLoggingEnabled: this.parseBoolean(process.env.WORKFLOW_FILE_LOGGING_ENABLED, true),
      logDirectory: isVercel ? '/tmp/logs/' : (process.env.WORKFLOW_LOG_DIRECTORY || 'logs/'),
      logLevel: this.parseLogLevel(process.env.WORKFLOW_LOG_LEVEL, LogLevel.INFO),
      customLogPath: process.env.WORKFLOW_CUSTOM_LOG_PATH,
      maxFileSize: this.parseNumber(process.env.WORKFLOW_MAX_FILE_SIZE, 10 * 1024 * 1024), // 10MB default
      rotateFiles: this.parseBoolean(process.env.WORKFLOW_ROTATE_FILES, false),
    };
  }

  /**
   * Checks if file logging is enabled.
   */
  static isFileLoggingEnabled(): boolean {
    return this.getConfig().fileLoggingEnabled;
  }

  /**
   * Gets the configured log directory.
   */
  static getLogDirectory(): string {
    return this.getConfig().logDirectory;
  }

  /**
   * Gets the configured log level.
   */
  static getLogLevel(): LogLevel {
    return this.getConfig().logLevel;
  }

  /**
   * Validates the current configuration.
   */
  static validateConfig(): string[] {
    const config = this.getConfig();
    const errors: string[] = [];

    if (!config.logDirectory) {
      errors.push('Log directory cannot be empty');
    }

    if (config.maxFileSize && config.maxFileSize < 1024) {
      errors.push('Max file size must be at least 1KB');
    }

    return errors;
  }

  /**
   * Resets the configuration cache (useful for testing).
   */
  static resetConfig(): void {
    this.config = null;
  }

  /**
   * Parses a boolean value from environment variable.
   */
  private static parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === 'true' || value === '1';
  }

  /**
   * Parses a log level from environment variable.
   */
  private static parseLogLevel(value: string | undefined, defaultValue: LogLevel): LogLevel {
    if (!value) return defaultValue;
    
    const upperValue = value.toUpperCase();
    if (Object.values(LogLevel).includes(upperValue as LogLevel)) {
      return upperValue as LogLevel;
    }
    
    return defaultValue;
  }

  /**
   * Parses a number from environment variable.
   */
  private static parseNumber(value: string | undefined, defaultValue: number): number {
    if (!value) return defaultValue;
    
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }
}