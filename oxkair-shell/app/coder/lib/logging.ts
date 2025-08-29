import { randomUUID } from "crypto";
import * as path from "path";
import {
  ExecutionTrace,
  ExecutionSummary,
  PerformanceMetrics,
  LoggedAgentExecutionContext,
} from "./logging-types";
import { ProcessingError } from "../../../lib/agents/newtypes";
import { StandardizedAgentResult, StandardizedEvidence } from "../../../lib/agents/newtypes";
import { FileLogWriter, FileLogWriterImpl } from "./file-log-writer.ts";
import { LogConfigManager, LogConfig } from "./log-config.ts";

// --- Comprehensive Logging Infrastructure ---

// Log levels enum for structured logging
export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
  TRACE = "TRACE",
  PERFORMANCE = "PERFORMANCE",
  VALIDATION = "VALIDATION",
  STATE_TRANSITION = "STATE_TRANSITION",
  AI_MODEL = "AI_MODEL",
  AI_USAGE = "AI_USAGE",
  DATA_ACCESS = "DATA_ACCESS",
  WORKFLOW = "WORKFLOW",
}

// Log destinations enum
export enum LogDestination {
  CONSOLE = "CONSOLE",
  FILE = "FILE",
  DATABASE = "DATABASE",
  EXTERNAL_SERVICE = "EXTERNAL_SERVICE",
}

// AI usage tracking interface
export interface AIUsageData {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  provider: string;
  requestDuration: number;
}

// Structured log entry interface
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  workflowId: string;
  stepNumber: number;
  functionName: string;
  taskCorrelation?: string; // Maps to Medical_Logic_Improvement_Gameplan.md tasks
  message: string;
  metadata?: Record<string, unknown>;
  performanceMetrics?: {
    duration?: number;
    memoryUsage?: number;
    inputSize?: number;
    outputSize?: number;
  };
  aiUsage?: AIUsageData; // New property for AI usage tracking
  destinations: LogDestination[];
  sensitiveDataScrubbed: boolean;
  // New properties for file logging
  fileWriteStatus?: "pending" | "written" | "failed";
  writeAttempts?: number;
}

export interface WorkflowLoggerConfig {
  enableFileLogging: boolean;
  logDirectory: string;
  logLevel: LogLevel;
  maxFileSize?: number;
  rotateFiles?: boolean;
  caseId?: string;
}

export class WorkflowLogger {
  private workflowId: string;
  private workflowStartTime: number;
  private workflowStepCounter: number;
  private agentStepCounter: number;
  private apiCallCounter: number;
  private executionTrace: ExecutionTrace[];
  private performanceMetrics: PerformanceMetrics;
  private totalAiCost: number;

  // File logging properties
  private fileWriter?: FileLogWriter;
  private fileLoggingEnabled: boolean;
  private logFilePath?: string;
  private fileWriteBuffer: LogEntry[];
  private bufferFlushInterval?: NodeJS.Timeout;
  private config: WorkflowLoggerConfig;

  constructor(
    initialWorkflowId?: string,
    config?: Partial<WorkflowLoggerConfig>,
  ) {
    this.workflowId = initialWorkflowId || randomUUID();
    this.workflowStartTime = Date.now();
    this.workflowStepCounter = 0;
    this.agentStepCounter = 0;
    this.apiCallCounter = 0;
    this.executionTrace = [];
    this.performanceMetrics = new PerformanceMetrics();
    this.fileWriteBuffer = [];
    this.totalAiCost = 0;

    // Initialize configuration
    const globalConfig = LogConfigManager.getConfig();
    const isVercel = process.env.VERCEL === "1";

    this.config = {
      enableFileLogging: isVercel
        ? false
        : (config?.enableFileLogging ?? globalConfig.fileLoggingEnabled),
      logDirectory: config?.logDirectory ?? globalConfig.logDirectory,
      logLevel: config?.logLevel ?? globalConfig.logLevel,
      maxFileSize: config?.maxFileSize ?? globalConfig.maxFileSize,
      rotateFiles: config?.rotateFiles ?? globalConfig.rotateFiles,
      caseId: config?.caseId,
    };

    this.fileLoggingEnabled = this.config.enableFileLogging;

    // Initialize file logging if enabled
    if (this.fileLoggingEnabled) {
      this.initializeFileLogging().catch((error) => {
        console.warn(
          `[WorkflowLogger] Failed to initialize file logging: ${error.message}`,
        );
        this.fileLoggingEnabled = false;
      });
    }

    this.logWorkflow(
      "WorkflowLogger.constructor",
      `Initialized comprehensive workflow logger`,
      {
        workflowId: this.workflowId,
        timestamp: new Date().toISOString(),
        fileLoggingEnabled: this.fileLoggingEnabled,
        logDirectory: this.config.logDirectory,
      },
    );
  }

  public getWorkflowId(): string {
    return this.workflowId;
  }

  public getFullLog(): LogEntry[] {
    return this.fileWriteBuffer;
  }

  public incrementStep(): number {
    return ++this.workflowStepCounter;
  }

  private createLogEntry(
    level: LogLevel,
    functionName: string,
    message: string,
    metadata?: Record<string, unknown>,
    taskCorrelation?: string,
    performanceMetrics?: LogEntry["performanceMetrics"],
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      workflowId: this.workflowId,
      stepNumber: this.incrementStep(),
      functionName,
      taskCorrelation,
      message: this.scrubSensitiveData(message),
      metadata: metadata
        ? this.scrubSensitiveDataFromObject(metadata, new WeakSet())
        : undefined,
      performanceMetrics,
      destinations: [LogDestination.CONSOLE], // Simplified destination
      sensitiveDataScrubbed: true,
    };
  }

  private writeStructuredLog(entry: LogEntry) {
    const formattedMessage = `[${entry.timestamp}] [${entry.level}] [WF:${entry.workflowId}] [Step:${entry.stepNumber}] [${entry.functionName}] ${entry.message}`;

    // Always write to console
    if (entry.destinations.includes(LogDestination.CONSOLE)) {
      switch (entry.level) {
        case LogLevel.ERROR:
          console.error(formattedMessage, entry.metadata);
          break;
        case LogLevel.WARN:
          console.warn(formattedMessage, entry.metadata);
          break;
        case LogLevel.DEBUG:
        case LogLevel.TRACE:
          console.debug(formattedMessage, entry.metadata);
          break;
        default:
          console.log(formattedMessage, entry.metadata);
      }
    }

    // Write to file if enabled and level meets threshold
    if (this.fileLoggingEnabled && this.shouldLogLevel(entry.level)) {
      this.writeToFile(entry);
    }
  }

  // Convenience logging functions
  public logTrace(
    functionName: string,
    message: string,
    metadata?: Record<string, unknown>,
    taskCorrelation?: string,
  ) {
    this.writeStructuredLog(
      this.createLogEntry(
        LogLevel.TRACE,
        functionName,
        message,
        metadata,
        taskCorrelation,
      ),
    );
  }

  public logDebug(
    functionName: string,
    message: string,
    metadata?: Record<string, unknown>,
    taskCorrelation?: string,
  ) {
    this.writeStructuredLog(
      this.createLogEntry(
        LogLevel.DEBUG,
        functionName,
        message,
        metadata,
        taskCorrelation,
      ),
    );
  }

  public logInfo(
    functionName: string,
    message: string,
    metadata?: Record<string, unknown>,
    taskCorrelation?: string,
  ) {
    this.writeStructuredLog(
      this.createLogEntry(
        LogLevel.INFO,
        functionName,
        message,
        metadata,
        taskCorrelation,
      ),
    );
  }

  public logWarn(
    functionName: string,
    message: string,
    metadata?: Record<string, unknown>,
    taskCorrelation?: string,
  ) {
    this.writeStructuredLog(
      this.createLogEntry(
        LogLevel.WARN,
        functionName,
        message,
        metadata,
        taskCorrelation,
      ),
    );
  }

  public logError(
    functionName: string,
    message: string,
    metadata?: Record<string, unknown>,
    taskCorrelation?: string,
  ) {
    this.writeStructuredLog(
      this.createLogEntry(
        LogLevel.ERROR,
        functionName,
        message,
        metadata,
        taskCorrelation,
      ),
    );
  }

  public logPerformance(
    functionName: string,
    message: string,
    metrics: LogEntry["performanceMetrics"],
    taskCorrelation?: string,
  ) {
    this.writeStructuredLog(
      this.createLogEntry(
        LogLevel.PERFORMANCE,
        functionName,
        message,
        undefined,
        taskCorrelation,
        metrics,
      ),
    );
  }

  public logWorkflow(
    functionName: string,
    message: string,
    metadata?: Record<string, unknown>,
    taskCorrelation?: string,
  ) {
    this.writeStructuredLog(
      this.createLogEntry(
        LogLevel.WORKFLOW,
        functionName,
        message,
        metadata,
        taskCorrelation,
      ),
    );
  }

  public logAiUsage(
    functionName: string,
    aiUsage: AIUsageData,
    taskCorrelation?: string,
  ) {
    // Track total AI cost
    this.totalAiCost += aiUsage.totalCost;

    const entry = this.createLogEntry(
      LogLevel.AI_USAGE,
      functionName,
      `AI API call completed - Model: ${aiUsage.model}, Tokens: ${aiUsage.totalTokens}, Cost: $${aiUsage.totalCost.toFixed(4)}`,
      {
        model: aiUsage.model,
        provider: aiUsage.provider,
        inputTokens: aiUsage.inputTokens,
        outputTokens: aiUsage.outputTokens,
        totalTokens: aiUsage.totalTokens,
        inputCost: aiUsage.inputCost,
        outputCost: aiUsage.outputCost,
        totalCost: aiUsage.totalCost,
        requestDuration: aiUsage.requestDuration,
        cumulativeCost: this.totalAiCost,
      },
      taskCorrelation,
    );

    // Add AI usage data to the log entry
    entry.aiUsage = aiUsage;

    this.writeStructuredLog(entry);
  }

  // Legacy logging functions for backward compatibility
  public logToBuffer(...args: unknown[]) {
    const message = args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");
    this.logInfo("Legacy", message);
  }

  public debugToBuffer(...args: unknown[]) {
    const message = args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");
    this.logDebug("Legacy", message);
  }

  public errorToBuffer(...args: unknown[]) {
    const message = args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");
    this.logError("Legacy", message);
  }

  // Enhanced logging methods with full context
  public logAgentStart(
    agentName: string,
    input: any,
    context: LoggedAgentExecutionContext,
  ): void {
    const stepId = `${this.workflowId}-agent-${++this.agentStepCounter}`;
    const entry = this.createLogEntry(
      LogLevel.WORKFLOW,
      `Agent.${agentName}.start`,
      `Starting agent execution`,
      {
        agentName,
        stepId,
        input: this.sanitizeInput(input),
        context: this.sanitizeContext(context),
        dependencies: context.dependencies || [],
        requiredServices: context.requiredServices || [],
      },
    );

    this.writeStructuredLog(entry);
    this.addToExecutionTrace("agent_start", agentName, stepId);
  }

  public logAgentEnd(
    agentName: string,
    result: StandardizedAgentResult,
    executionTime: number,
  ): void {
    const entry = this.createLogEntry(
      result.success ? LogLevel.INFO : LogLevel.ERROR,
      `Agent.${agentName}.end`,
      `Agent execution ${result.success ? "completed" : "failed"}`,
      {
        agentName,
        success: result.success,
        executionTime,
        evidenceCount: result.evidence?.length || 0,
        errorCount: result.errors?.length || 0,
        evidence:
          result.evidence?.map((e: StandardizedEvidence) =>
            this.sanitizeEvidence(e),
          ) || [],
        errors:
          result.errors?.map((e: ProcessingError) => this.sanitizeError(e)) ||
          [],
      },
    );

    this.writeStructuredLog(entry);
    this.addToExecutionTrace("agent_end", agentName, undefined, {
      success: result.success,
      executionTime,
    });
  }

  public logApiCall(
    service: string,
    method: string,
    input: any,
    startTime: number,
  ): string {
    const callId = `${this.workflowId}-api-${++this.apiCallCounter}`;
    const entry = this.createLogEntry(
      LogLevel.DEBUG,
      `API.${service}.${method}.start`,
      `Starting API call`,
      {
        service,
        method,
        callId,
        input: this.sanitizeApiInput(input),
        startTime: new Date(startTime).toISOString(),
      },
    );

    this.writeStructuredLog(entry);
    this.addToExecutionTrace("api_call_start", `${service}.${method}`, callId);
    return callId;
  }

  public logApiResponse(
    callId: string,
    service: string,
    method: string,
    response: any,
    error: any,
    executionTime: number,
  ): void {
    const entry = this.createLogEntry(
      error ? LogLevel.ERROR : LogLevel.DEBUG,
      `API.${service}.${method}.end`,
      `API call ${error ? "failed" : "completed"}`,
      {
        service,
        method,
        callId,
        executionTime,
        success: !error,
        response: error ? undefined : this.sanitizeApiResponse(response),
        error: error ? this.sanitizeError(error) : undefined,
        responseSize: response ? JSON.stringify(response).length : 0,
      },
    );

    this.writeStructuredLog(entry);
    this.addToExecutionTrace("api_call_end", `${service}.${method}`, callId, {
      success: !error,
      executionTime,
    });
  }

  public logStateTransition(
    fromState: any,
    toState: any,
    agentName: string,
    operation: string,
  ): void {
    const entry = this.createLogEntry(
      LogLevel.TRACE,
      `State.${operation}`,
      `State transition in ${agentName}`,
      {
        agentName,
        operation,
        fromState: this.sanitizeState(fromState),
        toState: this.sanitizeState(toState),
        differences: this.calculateStateDifferences(fromState, toState),
      },
    );

    this.writeStructuredLog(entry);
    this.addToExecutionTrace("state_transition", agentName, undefined, {
      operation,
    });
  }

  public logOrchestratorStep(
    step: string,
    agentName: string,
    dependencies: string[],
    status: "start" | "end" | "skip",
  ): void {
    const entry = this.createLogEntry(
      LogLevel.WORKFLOW,
      `Orchestrator.${step}.${status}`,
      `Orchestrator step ${status}: ${step}`,
      {
        step,
        agentName,
        dependencies,
        status,
        executedAgents: this.executionTrace
          .filter((t) => t.type === "agent_end" && t.success && typeof t.component === "string")
          .map((t) => t.component),
        pendingAgents: this.getPendingAgents(),
      },
    );

    this.writeStructuredLog(entry);
    this.addToExecutionTrace("orchestrator_step", step, undefined, {
      agentName,
      status,
    });
  }

  // Performance and metrics logging
  public logPerformanceMetrics(component: string, metrics: any): void {
    this.performanceMetrics.add(component, metrics);
    const entry = this.createLogEntry(
      LogLevel.PERFORMANCE,
      `Performance.${component}`,
      `Performance metrics recorded`,
      {
        component,
        metrics,
        cumulativeMetrics: this.performanceMetrics.getCumulative(),
      },
    );

    this.writeStructuredLog(entry);
  }

  // Execution summary and diagnostics
  public generateExecutionSummary(): ExecutionSummary {
    const totalTime = Date.now() - this.workflowStartTime;
    const agentMetrics = this.calculateAgentMetrics();
    const apiMetrics = this.calculateApiMetrics();

    return {
      workflowId: this.workflowId,
      totalExecutionTime: totalTime,
      totalSteps: this.workflowStepCounter,
      agentExecutions: this.agentStepCounter,
      apiCalls: this.apiCallCounter,
      agentMetrics,
      apiMetrics,
      executionTrace: this.executionTrace,
      performanceMetrics: this.performanceMetrics.getAll(),
      totalAiCost: this.totalAiCost,
    };
  }

  /**
   * Closes the logger and flushes any remaining log entries.
   */
  public async close(): Promise<void> {
    if (this.bufferFlushInterval) {
      clearInterval(this.bufferFlushInterval);
      this.bufferFlushInterval = undefined;
    }

    if (this.fileWriter) {
      await this.fileWriter.close();
      this.fileWriter = undefined;
    }
  }

  // File logging methods
  private async initializeFileLogging(): Promise<void> {
    if (!this.fileLoggingEnabled) return;

    try {
      this.fileWriter = new FileLogWriterImpl();
      this.logFilePath = this.generateLogFilePath();

      const initialized = await this.fileWriter.initialize(this.logFilePath);
      if (!initialized) {
        this.fileLoggingEnabled = false;
        console.warn(
          "[WorkflowLogger] File logging initialization failed, falling back to console only",
        );
      }
    } catch (error) {
      this.fileLoggingEnabled = false;
      console.warn(
        `[WorkflowLogger] File logging initialization error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  private generateLogFilePath(): string {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("Z", "");
    const caseId = this.config.caseId || this.workflowId;
    const sanitizedCaseId = this.sanitizeFileName(caseId);
    const fileName = `workflow-${timestamp}-${sanitizedCaseId}.log`;

    // Use the configured log directory, or fallback to a 'logs' directory within the current working directory
    const baseLogDir =
      this.config.logDirectory && this.config.logDirectory !== "/root"
        ? this.config.logDirectory
        : path.join(process.cwd(), "logs");

    return path.join(baseLogDir, fileName);
  }

  private sanitizeFileName(fileName: string): string {
    // Remove or replace characters that are not safe for filenames
    return fileName.replace(/[^a-zA-Z0-9\-_]/g, "-").substring(0, 50);
  }

  private shouldLogLevel(level: LogLevel): boolean {
    const levelPriority = {
      [LogLevel.TRACE]: 0,
      [LogLevel.DEBUG]: 1,
      [LogLevel.INFO]: 2,
      [LogLevel.WARN]: 3,
      [LogLevel.ERROR]: 4,
      [LogLevel.PERFORMANCE]: 2,
      [LogLevel.VALIDATION]: 2,
      [LogLevel.STATE_TRANSITION]: 1,
      [LogLevel.AI_MODEL]: 2,
      [LogLevel.AI_USAGE]: 2,
      [LogLevel.DATA_ACCESS]: 2,
      [LogLevel.WORKFLOW]: 2,
    };

    const currentLevelPriority = levelPriority[this.config.logLevel] || 2;
    const entryLevelPriority = levelPriority[level] || 2;

    return entryLevelPriority >= currentLevelPriority;
  }

  private writeToFile(entry: LogEntry): void {
    if (!this.fileWriter || !this.fileLoggingEnabled) return;

    // Mark entry as pending file write
    entry.fileWriteStatus = "pending";
    entry.writeAttempts = (entry.writeAttempts || 0) + 1;

    this.fileWriter
      .writeEntry(entry)
      .then(() => {
        entry.fileWriteStatus = "written";
      })
      .catch((error) => {
        entry.fileWriteStatus = "failed";
        // Don't log to console to avoid infinite loops, just mark as failed
      });
  }

  // Helper methods for data sanitization
  private scrubSensitiveData(text: any): string {
    if (typeof text !== "string") {
      return text;
    }
    // Remove potential PII patterns
    return text
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN-REDACTED]") // SSN
      .replace(/\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/g, "[CARD-REDACTED]") // Credit card
      .replace(
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        "[EMAIL-REDACTED]",
      ) // Email
      .replace(/\b\d{10,}\b/g, "[PHONE-REDACTED]"); // Phone numbers
  }

  private scrubSensitiveDataFromObject<T>(obj: T, visited = new WeakSet()): T {
    if (typeof obj === "string") {
      return this.scrubSensitiveData(obj) as T;
    }
    if (obj instanceof Error) {
      const plainError: Record<string, unknown> = {};
      Object.getOwnPropertyNames(obj).forEach((key) => {
        plainError[key] = (obj as any)[key];
      });
      // The result of serializing the error is an object, so we recursively scrub it.
      return this.scrubSensitiveDataFromObject(plainError as T, visited);
    }
    if (typeof obj === "object" && obj !== null) {
      // Check for circular references
      if (visited.has(obj)) {
        return "[CIRCULAR-REFERENCE]" as T;
      }
      visited.add(obj);

      if (Array.isArray(obj)) {
        const scrubbedArray: unknown[] = [];
        for (const value of obj) {
          scrubbedArray.push(this.scrubSensitiveDataFromObject(value, visited));
        }
        return scrubbedArray as T;
      } else {
        const scrubbedObject: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
          if (
            key.toLowerCase().includes("ssn") ||
            key.toLowerCase().includes("socialsecuritynumber")
          ) {
            scrubbedObject[key] = "[SSN-REDACTED]";
          } else if (
            ["creditCard", "password", "token"].includes(key.toLowerCase())
          ) {
            scrubbedObject[key] = "[REDACTED]";
          } else {
            scrubbedObject[key] = this.scrubSensitiveDataFromObject(value, visited);
          }
        }
        return scrubbedObject as T;
      }
    }
    return obj;
  }

  private sanitizeInput(input: any): any {
    return this.scrubSensitiveDataFromObject(input, new WeakSet());
  }

  private sanitizeContext(context: LoggedAgentExecutionContext): any {
    return {
      caseId: context.state?.caseMeta?.caseId,
      currentStep: context.state?.currentStep,
      previousResults: context.state?.previousResults ? "present" : "absent",
      serviceCount: Object.keys(context.services || {}).length,
    };
  }

  private sanitizeEvidence(evidence: StandardizedEvidence): any {
    return {
      type: "standardized_evidence",
      verbatimEvidenceCount: evidence.verbatimEvidence.length,
      rationale: evidence.rationale,
      sourceAgent: evidence.sourceAgent,
      sourceNote: evidence.sourceNote,
      confidence: evidence.confidence,
      hasContent: !!evidence.content,
      timestamp: new Date(),
    };
  }

  private sanitizeError(error: ProcessingError): any {
    return {
      message: error.message,
      severity: error.severity,
      timestamp: error.timestamp,
    };
  }

  private sanitizeApiInput(input: any): any {
    // Specific sanitization for API inputs
    return this.scrubSensitiveDataFromObject(input, new WeakSet());
  }

  private sanitizeApiResponse(response: any): any {
    // Specific sanitization for API responses
    return this.scrubSensitiveDataFromObject(response, new WeakSet());
  }

  private sanitizeState(state: any): any {
    return {
      caseId: state?.caseMeta?.caseId,
      currentStep: state?.currentStep,
      procedureCodeCount: state?.procedureCodes?.length || 0,
      diagnosisCodeCount: state?.diagnosisCodes?.length || 0,
      modifierCount: state?.modifiers?.length || 0,
      evidenceCount: state?.evidence?.length || 0,
    };
  }

  private calculateStateDifferences(fromState: any, toState: any): any {
    // Calculate meaningful differences between states
    return {
      procedureCodesChanged:
        (fromState?.procedureCodes?.length || 0) !==
        (toState?.procedureCodes?.length || 0),
      diagnosisCodesChanged:
        (fromState?.diagnosisCodes?.length || 0) !==
        (toState?.diagnosisCodes?.length || 0),
      modifiersChanged:
        (fromState?.modifiers?.length || 0) !==
        (toState?.modifiers?.length || 0),
      evidenceChanged:
        (fromState?.evidence?.length || 0) !== (toState?.evidence?.length || 0),
    };
  }

  private addToExecutionTrace(
    type:
      | "agent_start"
      | "agent_end"
      | "api_call_start"
      | "api_call_end"
      | "orchestrator_step"
      | "state_transition",
    component: string,
    stepId?: string,
    metadata?: any,
  ): void {
    this.executionTrace.push({
      type,
      component,
      stepId,
      timestamp: Date.now(),
      metadata,
      success: metadata?.success,
    });
  }

  private getPendingAgents(): string[] {
    const executed = this.executionTrace
      .filter((t) => t.type === "agent_end" && typeof t.component === "string")
      .map((t) => t.component);
    const allAgents = [
      "demographics_analysis",
      "cci_validation",
      "lcd_coverage",
      "modifier_assignment",
    ];
    return allAgents.filter((agent) => !executed.includes(agent));
  }

  private calculateAgentMetrics(): any {
    const agentMetrics: { [key: string]: any } = {};
    const agentStartTimes: { [key: string]: number } = {};

    for (const trace of this.executionTrace) {
      if (trace.type === "agent_start") {
        agentStartTimes[trace.component] = new Date(trace.timestamp).getTime();
      } else if (trace.type === "agent_end") {
        const startTime =
          agentStartTimes[trace.component] ||
          new Date(trace.timestamp).getTime();
        const endTime = new Date(trace.timestamp).getTime();
        const duration =
          trace.metadata.executionTime !== undefined
            ? trace.metadata.executionTime
            : endTime - startTime;

        if (!agentMetrics[trace.component]) {
          agentMetrics[trace.component] = {
            executions: 0,
            totalDuration: 0,
            successes: 0,
            failures: 0,
          };
        }

        agentMetrics[trace.component].executions += 1;
        agentMetrics[trace.component].totalDuration += duration;
        if (trace.metadata.success) {
          agentMetrics[trace.component].successes += 1;
        } else {
          agentMetrics[trace.component].failures += 1;
        }
      }
    }
    return agentMetrics;
  }

  private calculateApiMetrics(): any {
    const apiCalls = this.executionTrace.filter(
      (t) => t.type === "api_call_end",
    );
    if (apiCalls.length === 0) {
      return {
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        averageExecutionTime: 0,
      };
    }
    return {
      totalCalls: apiCalls.length,
      successfulCalls: apiCalls.filter((t) => t.success).length,
      failedCalls: apiCalls.filter((t) => !t.success).length,
      averageExecutionTime:
        apiCalls.reduce((sum, t) => sum + (t.metadata?.executionTime || 0), 0) /
        apiCalls.length,
    };
  }
}

/**
 * Logs the result of a parameter validation check.
 * @param logger The WorkflowLogger instance.
 * @param functionName The name of the function where the validation occurs.
 * @param parameterName The name of the parameter being validated.
 * @param validationRule The rule being applied.
 * @param isValid Whether the validation passed.
 * @param value The value of the parameter (optional, logged if not sensitive).
 * @param taskCorrelation The task ID from the game plan.
 */
export function logParameterValidation(
  logger: WorkflowLogger,
  functionName: string,
  parameterName: string,
  validationRule: string,
  isValid: boolean,
  value?: unknown,
  taskCorrelation?: string,
) {
  const message = `Validation ${
    isValid ? "passed" : "failed"
  } for ${parameterName}. Rule: ${validationRule}.`;
  const metadata: Record<string, unknown> = {
    parameter: parameterName,
    rule: validationRule,
    isValid,
  };

  // Only include value if it's not overly large
  if (value !== undefined && JSON.stringify(value).length < 500) {
    metadata.value = value;
  }

  if (isValid) {
    logger.logDebug(functionName, message, metadata, taskCorrelation);
  } else {
    logger.logWarn(functionName, message, metadata, taskCorrelation);
  }
}

/**
 * Wraps a function with execution logging, creating a new logger instance for it.
 * This HOF injects a logger instance into the wrapped function.
 * @param fn The function to wrap. It must accept a WorkflowLogger as its first argument.
 * @param functionName The name of the function for logging purposes.
 * @returns The wrapped function.
 */
export function logFunctionExecution<A extends any[], R>(
  fn: (logger: WorkflowLogger, ...args: A) => R,
  functionName: string,
): (...args: A) => R {
  return function (...args: A): R {
    const logger = new WorkflowLogger(functionName);
    const startTime = Date.now();
    logger.logTrace(functionName, "Function execution start", { args });

    try {
      // Pass the created logger instance to the target function
      const result = fn(logger, ...args);

      if (result instanceof Promise) {
        return result
          .then((resolvedResult) => {
            const duration = Date.now() - startTime;
            logger.logPerformance(
              functionName,
              "Async function execution success",
              { duration },
            );
            return resolvedResult;
          })
          .catch((error) => {
            const duration = Date.now() - startTime;
            logger.logError(functionName, "Async function execution error", {
              error,
              duration,
            });
            throw error;
          }) as R;
      } else {
        const duration = Date.now() - startTime;
        logger.logPerformance(functionName, "Function execution success", {
          duration,
        });
        return result;
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.logError(functionName, "Function execution error", {
        error,
        duration,
      });
      throw error;
    }
  } as (...args: A) => R;
}
