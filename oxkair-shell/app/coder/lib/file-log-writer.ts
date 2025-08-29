/**
 * File Log Writer
 * 
 * Handles file system operations for logging with error recovery,
 * buffering, and graceful degradation.
 */

import * as fs from 'fs';
import * as path from 'path';
import { LogEntry } from './logging.ts';

export interface FileLogWriter {
  initialize(logFilePath: string): Promise<boolean>;
  writeEntry(entry: LogEntry): Promise<void>;
  flush(): Promise<void>;
  close(): Promise<void>;
  isHealthy(): boolean;
}

export class FileLogWriterImpl implements FileLogWriter {
  private writeStream?: fs.WriteStream;
  private isInitialized: boolean = false;
  private hasErrors: boolean = false;
  private writeQueue: LogEntry[] = [];
  private isWriting: boolean = false;
  private logFilePath?: string;
  private flushInterval?: NodeJS.Timeout;

  constructor() {
    // Set up periodic flush every 5 seconds
    this.flushInterval = setInterval(() => {
      this.flush().catch(() => {
        // Errors are handled in flush method
      });
    }, 5000);
  }

  /**
   * Initializes the file writer with the specified log file path.
   */
  async initialize(logFilePath: string): Promise<boolean> {
    try {
      this.logFilePath = logFilePath;

      // Ensure directory exists
      const logDir = path.dirname(logFilePath);
      await this.ensureDirectoryExists(logDir);

      // Create write stream
      this.writeStream = fs.createWriteStream(logFilePath, {
        flags: 'a', // append mode
        encoding: 'utf8'
      });

      // Set up error handling
      this.writeStream.on('error', (error) => {
        this.handleWriteError(error);
      });

      // Write header
      await this.writeHeader();

      this.isInitialized = true;
      this.hasErrors = false;

      return true;
    } catch (error) {
      this.handleInitializationError(error);
      return false;
    }
  }

  /**
   * Writes a log entry to the file.
   */
  async writeEntry(entry: LogEntry): Promise<void> {
    if (!this.isInitialized || this.hasErrors) {
      return; // Fail silently to allow console logging to continue
    }

    // Add to queue for buffered writing
    this.writeQueue.push(entry);

    // Process queue if not already processing
    if (!this.isWriting) {
      await this.processWriteQueue();
    }
  }

  /**
   * Flushes any buffered entries to the file.
   */
  async flush(): Promise<void> {
    if (!this.isInitialized || this.hasErrors || this.writeQueue.length === 0) {
      return;
    }

    await this.processWriteQueue();
  }

  /**
   * Closes the file writer and cleans up resources.
   */
  async close(): Promise<void> {
    console.log('[FileLogWriter] Closing file writer...');
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = undefined;
    }

    // Wait for any ongoing writes to complete before closing
    while (this.isWriting) {
      console.log('[FileLogWriter] Waiting for ongoing writes to complete...');
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Flush any remaining entries
    try {
      await this.flush();
    } catch (error) {
      console.warn(`[FileLogWriter] Error during flush before close: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    if (this.writeStream && !this.writeStream.destroyed) {
      return new Promise((resolve) => {
        this.writeStream!.end(() => {
          console.log('[FileLogWriter] Write stream ended.');
          this.writeStream = undefined;
          this.isInitialized = false;
          this.hasErrors = false; // Reset errors on successful close
          resolve();
        });
      });
    } else {
      console.log('[FileLogWriter] Write stream already closed or destroyed, no need to end.');
      this.writeStream = undefined;
      this.isInitialized = false;
      this.hasErrors = false; // Reset errors
    }
  }

  /**
   * Checks if the file writer is healthy and operational.
   */
  isHealthy(): boolean {
    return this.isInitialized && !this.hasErrors;
  }

  /**
   * Processes the write queue by writing entries to file.
   */
  private async processWriteQueue(): Promise<void> {
    if (this.isWriting || !this.writeStream || this.hasErrors) {
      console.debug(`[FileLogWriter] Skipping processWriteQueue. isWriting: ${this.isWriting}, writeStream: ${!!this.writeStream}, hasErrors: ${this.hasErrors}`);
      return;
    }

    this.isWriting = true;
    console.debug(`[FileLogWriter] Processing write queue. Queue size: ${this.writeQueue.length}`);

    try {
      while (this.writeQueue.length > 0) {
        const entry = this.writeQueue.shift()!;
        const logLine = this.formatLogEntry(entry);

        console.debug(`[FileLogWriter] Writing entry to stream: ${entry.message}`);
        await this.writeToStream(logLine);
      }
      console.debug('[FileLogWriter] Write queue processed.');
    } catch (error) {
      console.error(`[FileLogWriter] Error during processWriteQueue: ${error instanceof Error ? error.message : 'Unknown error'}`);
      this.handleWriteError(error);
    } finally {
      this.isWriting = false;
    }
  }

  /**
   * Writes a string to the file stream.
   */
  private writeToStream(data: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.writeStream) {
        reject(new Error('Write stream not available'));
        return;
      }

      this.writeStream.write(data, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Formats a log entry for file output.
   */
  private formatLogEntry(entry: LogEntry): string {
    let logLine = `[${entry.timestamp}] [${entry.level}] [WF:${entry.workflowId}] [Step:${entry.stepNumber}] [${entry.functionName}] ${entry.message}`;

    if (entry.metadata) {
      logLine += ` ${JSON.stringify(entry.metadata)}`;
    }

    return logLine + '\n';
  }

  /**
   * Writes the log file header with workflow metadata.
   */
  private async writeHeader(): Promise<void> {
    if (!this.writeStream) return;

    const header = `=== WORKFLOW LOG ===
Start Time: ${new Date().toISOString()}
Log Format Version: 1.0
========================

`;

    await this.writeToStream(header);
  }

  /**
   * Ensures the specified directory exists, creating it if necessary.
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.promises.access(dirPath);
    } catch {
      // Directory doesn't exist, create it
      await fs.promises.mkdir(dirPath, { recursive: true, mode: 0o755 });
    }
  }

  /**
   * Handles write errors by disabling file logging.
   */
  private handleWriteError(error: any): void {
    console.error(`[FileLogWriter] Detected write error: ${error.message}. Disabling file logging.`);
    this.hasErrors = true;

    // Clear the write queue to prevent memory leaks
    this.writeQueue = [];

    // Explicitly destroy the stream to prevent further write attempts
    if (this.writeStream && !this.writeStream.destroyed) {
      this.writeStream.destroy(error);
      this.writeStream = undefined;
      console.log('[FileLogWriter] Write stream destroyed due to error.');
    }
  }

  /**
   * Handles initialization errors.
   */
  private handleInitializationError(error: any): void {
    this.hasErrors = true;
    console.warn(`[FileLogWriter] Failed to initialize file logging: ${error.message}`);
  }
}