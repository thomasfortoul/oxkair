import { RetrievalResult } from './service-types';
import { LCDPolicy, LCDServiceMetrics } from './service-types';
import {
  CacheService,
  CircuitBreakerState,
  CircuitBreakerConfig,
} from "./service-types";
import { WorkflowLogger } from "../../app/coder/lib/logging";
import { RetrievalService } from "./service-types";
import { LCDService } from './lcd-service';
/**
 * Circuit breaker implementation for LCD service reliability.
 */
class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private nextAttemptTime = 0;

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error("Circuit breaker is OPEN");
      }
      this.state = CircuitBreakerState.HALF_OPEN;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = CircuitBreakerState.CLOSED;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitBreakerState.OPEN;
      this.nextAttemptTime = Date.now() + this.config.timeout;
    }
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getFailureCount(): number {
    return this.failureCount;
  }

  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.nextAttemptTime = 0;
  }
}

export class LCDServiceImpl implements LCDService {
  private circuitBreaker: CircuitBreaker;
  private metrics: LCDServiceMetrics;

  constructor(
    private retrievalService: RetrievalService,
    private cacheService: CacheService,
    private logger: WorkflowLogger,
  ) {
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      timeout: 60000, // 1 minute
      monitoringPeriod: 300000, // 5 minutes
    });

    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageRetrievalTime: 0,
      averageSynthesisTime: 0,
      cacheHitRate: 0,
      circuitBreakerState: this.circuitBreaker.getState(),
      policyEvaluationStats: {
        passRate: 0,
        failRate: 0,
        unknownRate: 0,
      },
    };
  }

  async fetchLCDPolicies(
    query: {
      codes: { code: string; description?: string }[];
      macJurisdiction: string;
      noteText: string;
      dateOfService: string;
    },
    maxResults: number = 5,
  ): Promise<RetrievalResult[]> {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    try {
      return await this.circuitBreaker.execute(async () => {
        // Check cache first
        const cacheKey = this.generateCacheKey(query);
        const cached = await this.cacheService.get<RetrievalResult[]>(cacheKey);

        if (cached) {
          this.logger.logInfo("LCDService", "Cache hit for LCD policies", {
            cacheKey,
          });
          this.updateMetrics(startTime, true);
          return cached;
        }

        // Build retrieval query
        const retrievalQuery = this.buildRetrievalQuery(query);

        // Call existing retrieval service
        const results = await this.retrievalService.searchLCDPolicies(
          retrievalQuery,
          maxResults,
        );

        // Transform and validate results
        const transformedResults = await this.transformRetrievalResults(
          results,
          query.dateOfService,
        );

        // Cache results
        await this.cacheService.set(cacheKey, transformedResults, 3600); // 1 hour cache

        this.logger.logInfo(
          "LCDService",
          "Successfully retrieved LCD policies",
          {
            query: query.codes,
            resultsCount: transformedResults.length,
            executionTime: Date.now() - startTime,
          },
        );

        this.updateMetrics(startTime, false);
        return transformedResults;
      });
    } catch (error: any) {
      this.metrics.failedRequests++;
      this.logger.logError("LCDService", "Failed to fetch LCD policies", {
        error,
        query,
        circuitBreakerState: this.circuitBreaker.getState(),
      });

      // Implement fallback strategy
      return this.getFallbackResults(query, maxResults);
    }
  }

  private updateMetrics(startTime: number, cacheHit: boolean): void {
    this.metrics.successfulRequests++;
    const executionTime = Date.now() - startTime;
    this.metrics.averageRetrievalTime =
      (this.metrics.averageRetrievalTime + executionTime) / 2;

    if (cacheHit) {
      this.metrics.cacheHitRate =
        (this.metrics.cacheHitRate + 1) / this.metrics.totalRequests;
    }

    this.metrics.circuitBreakerState = this.circuitBreaker.getState();
  }

  private async getFallbackResults(
    query: {
      codes: { code: string; description?: string }[];
      macJurisdiction: string;
      noteText: string;
      dateOfService: string;
    },
    maxResults: number,
  ): Promise<RetrievalResult[]> {
    // Check if we have any cached results for similar queries
    const fallbackKey = `fallback:${query.codes.map((c) => c.code).join(",")}-${query.macJurisdiction}`;
    const fallbackResults =
      await this.cacheService.get<RetrievalResult[]>(fallbackKey);

    if (fallbackResults) {
      this.logger.logInfo("LCDService", "Using fallback cached results", {
        queryKey: fallbackKey,
      });
      return fallbackResults;
    }

    // Return empty results with appropriate metadata
    this.logger.logWarn("LCDService", "No fallback results available", {
      query: query.codes,
      circuitBreakerState: this.circuitBreaker.getState(),
    });

    return [];
  }

  private buildRetrievalQuery(query: {
    codes: { code: string; description?: string }[];
    macJurisdiction: string;
    noteText: string;
  }): string {
    // Combine procedure codes, jurisdiction, and key note excerpts
    const codeContext = query.codes
      .map((c) => {
        if (c.description && c.description.trim()) {
          return `${c.code} (${c.description})`;
        }
        return c.code;
      })
      .join(", ");
    const noteKeywords = this.extractKeywords(query.noteText);

    return `Procedure codes: ${codeContext}. Jurisdiction: ${query.macJurisdiction}. Clinical context: ${noteKeywords}`;
  }

  private extractKeywords(noteText: string): string {
    // Simple keyword extraction - could be enhanced with NLP
    const keywords = noteText
      .toLowerCase()
      .match(
        /\b(diagnosis|procedure|treatment|therapy|surgery|examination|test|imaging|laboratory|medication)\w*\b/g,
      );

    return keywords ? keywords.slice(0, 10).join(", ") : "";
  }

  // Additional methods...
  public async getCachedPolicy(policyId: string): Promise<LCDPolicy | null> {
    return this.cacheService.get<LCDPolicy>(`lcd-policy:${policyId}`);
  }

  public async cachePolicy(policy: LCDPolicy): Promise<void> {
    await this.cacheService.set(`lcd-policy:${policy.policyId}`, policy, 86400); // 24-hour cache
  }

  public validateJurisdiction(jurisdiction: string): boolean {
    // Implement actual jurisdiction validation logic
    return !!jurisdiction;
  }

  public async getJurisdictionByZip(zipCode: string): Promise<string> {
    // Implement zip to jurisdiction mapping
    return "J15"; // Placeholder
  }

  public async healthCheck(): Promise<boolean> {
    // Implement health check logic for dependencies
    return true;
  }

  public async getMetrics(): Promise<LCDServiceMetrics> {
    return {
      ...this.metrics,
      circuitBreakerState: this.circuitBreaker.getState(),
    };
  }

  public resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
    this.logger.logInfo("LCDService", "Circuit breaker reset");
  }

  public getCircuitBreakerState(): CircuitBreakerState {
    return this.circuitBreaker.getState();
  }

  private generateCacheKey(query: {
    codes: { code: string; description?: string }[];
    macJurisdiction: string;
    noteText: string;
    dateOfService: string;
  }): string {
    const codeKey = query.codes.map((c) => c.code).join(",");
    const queryPart = `codes:${codeKey}|macJurisdiction:${query.macJurisdiction}|noteText:${query.noteText}|dateOfService:${query.dateOfService}`;
    return `lcd-policies:${queryPart}`;
  }

  private async transformRetrievalResults(
    results: any[],
    dateOfService: string,
  ): Promise<RetrievalResult[]> {
    // Implement transformation logic
    return results as RetrievalResult[];
  }
}
