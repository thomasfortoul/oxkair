/**
 * Cache Service and Performance Monitoring
 *
 * This file implements caching functionality and performance monitoring
 * for the AI Agent Architecture. It provides in-memory caching with TTL
 * support and comprehensive performance metrics collection.
 */

import {
  CacheService as ICacheService,
  PerformanceMonitor as IPerformanceMonitor,
  CacheEntry,
  PerformanceMetrics,
  ProcessingError,
  ERROR_CODES
} from '../agents/types.ts';
import { ProcessingErrorSeverity } from '../agents/newtypes.ts';

import crypto from 'crypto';

// ============================================================================
// CACHE SERVICE IMPLEMENTATION
// ============================================================================

export class CacheService implements ICacheService {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private defaultTTL: number;
  private maxCacheSize: number;
  private cleanupInterval: NodeJS.Timeout;

  constructor(defaultTTLMs: number = 300000, maxCacheSize: number = 1000) {
    this.defaultTTL = defaultTTLMs;
    this.maxCacheSize = maxCacheSize;

    // Set up periodic cleanup of expired entries
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, 60000); // Clean up every minute
  }

  /**
   * Retrieves a value from the cache.
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const entry = this.cache.get(key);

      if (!entry) {
        return null;
      }

      // Check if entry has expired
      if (new Date() > entry.expiresAt) {
        this.cache.delete(key);
        return null;
      }

      // Update access count
      entry.accessCount++;

      return entry.value as T;

    } catch (error) {
      throw new CacheServiceError(
        ERROR_CODES.SERVICE_UNAVAILABLE,
        `Cache get operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ProcessingErrorSeverity.LOW
      );
    }
  }

  /**
   * Stores a value in the cache.
   */
  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    try {
      // Enforce cache size limit
      if (this.cache.size >= this.maxCacheSize) {
        this.evictLeastRecentlyUsed();
      }

      const ttl = ttlMs || this.defaultTTL;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttl);

      const entry: CacheEntry<T> = {
        value,
        expiresAt,
        createdAt: now,
        accessCount: 0
      };

      this.cache.set(key, entry);

    } catch (error) {
      throw new CacheServiceError(
        ERROR_CODES.SERVICE_UNAVAILABLE,
        `Cache set operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ProcessingErrorSeverity.LOW
      );
    }
  }

  /**
   * Generates a cache key from an object.
   */
  generateCacheKey(data: any): string {
    try {
      const serialized = JSON.stringify(data, Object.keys(data).sort());
      return this.hashObject(serialized);
    } catch (error) {
      // If serialization fails, use timestamp-based key
      return `fallback_${Date.now()}_${Math.random()}`;
    }
  }

  /**
   * Hashes an object to create a cache key.
   */
  private hashObject(data: string): string {
    return crypto
      .createHash('sha256')
      .update(data)
      .digest('hex')
      .substring(0, 16); // Use first 16 characters for shorter keys
  }

  /**
   * Removes expired entries from the cache.
   */
  private cleanupExpiredEntries(): void {
    const now = new Date();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
    }
  }

  /**
   * Evicts the least recently used entry when cache is full.
   */
  private evictLeastRecentlyUsed(): void {
    let lruKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.accessCount < oldestAccess) {
        oldestAccess = entry.accessCount;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
    }
  }

  /**
   * Clears all entries from the cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Gets cache statistics.
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    totalEntries: number;
    expiredEntries: number;
  } {
    const now = new Date();
    let totalAccesses = 0;
    let expiredCount = 0;

    for (const entry of this.cache.values()) {
      totalAccesses += entry.accessCount;
      if (now > entry.expiresAt) {
        expiredCount++;
      }
    }

    const hitRate = totalAccesses > 0 ? (this.cache.size / totalAccesses) : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      hitRate: Math.min(1, hitRate),
      totalEntries: this.cache.size,
      expiredEntries: expiredCount
    };
  }

  /**
   * Destroys the cache service and cleans up resources.
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
  }
}

// ============================================================================
// PERFORMANCE MONITOR IMPLEMENTATION
// ============================================================================

export class PerformanceMonitor implements IPerformanceMonitor {
  private metrics: Map<string, OperationMetrics> = new Map();
  private activeOperations: Map<string, number> = new Map();

  /**
   * Executes an operation with timing and monitoring.
   */
  async timedOperation<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const operationId = `${name}_${Date.now()}_${Math.random()}`;
    const startTime = Date.now();

    try {
      this.activeOperations.set(operationId, startTime);

      const result = await operation();

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      this.recordSuccess(name, executionTime);
      this.activeOperations.delete(operationId);

      return result;

    } catch (error) {
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      this.recordError(name, executionTime);
      this.activeOperations.delete(operationId);

      throw error;
    }
  }

  /**
   * Records a successful operation.
   */
  private recordSuccess(operationName: string, executionTime: number): void {
    const metrics = this.getOrCreateMetrics(operationName);

    metrics.executionCount++;
    metrics.totalTime += executionTime;
    metrics.minTime = Math.min(metrics.minTime, executionTime);
    metrics.maxTime = Math.max(metrics.maxTime, executionTime);
    metrics.lastExecutionTime = executionTime;
    metrics.lastUpdateTime = new Date();
  }

  /**
   * Records a failed operation.
   */
  private recordError(operationName: string, executionTime: number): void {
    const metrics = this.getOrCreateMetrics(operationName);

    metrics.executionCount++;
    metrics.errorCount++;
    metrics.totalTime += executionTime;
    metrics.minTime = Math.min(metrics.minTime, executionTime);
    metrics.maxTime = Math.max(metrics.maxTime, executionTime);
    metrics.lastExecutionTime = executionTime;
    metrics.lastUpdateTime = new Date();
  }

  /**
   * Gets or creates metrics for an operation.
   */
  private getOrCreateMetrics(operationName: string): OperationMetrics {
    if (!this.metrics.has(operationName)) {
      this.metrics.set(operationName, {
        executionCount: 0,
        errorCount: 0,
        totalTime: 0,
        minTime: Infinity,
        maxTime: 0,
        lastExecutionTime: 0,
        lastUpdateTime: new Date()
      });
    }

    return this.metrics.get(operationName)!;
  }

  /**
   * Gets aggregated metrics for all operations.
   */
  getAggregatedMetrics(): PerformanceMetrics[] {
    const result: PerformanceMetrics[] = [];

    for (const [operationName, metrics] of this.metrics.entries()) {
      const averageTime = metrics.executionCount > 0
        ? metrics.totalTime / metrics.executionCount
        : 0;

      const errorRate = metrics.executionCount > 0
        ? metrics.errorCount / metrics.executionCount
        : 0;

      result.push({
        operationName,
        executionCount: metrics.executionCount,
        averageTime: Math.round(averageTime * 100) / 100, // Round to 2 decimal places
        minTime: metrics.minTime === Infinity ? 0 : metrics.minTime,
        maxTime: metrics.maxTime,
        errorRate: Math.round(errorRate * 10000) / 100 // Convert to percentage with 2 decimal places
      });
    }

    return result.sort((a, b) => b.executionCount - a.executionCount);
  }

  /**
   * Gets metrics for a specific operation.
   */
  getOperationMetrics(operationName: string): PerformanceMetrics | null {
    const metrics = this.metrics.get(operationName);
    if (!metrics) return null;

    const averageTime = metrics.executionCount > 0
      ? metrics.totalTime / metrics.executionCount
      : 0;

    const errorRate = metrics.executionCount > 0
      ? metrics.errorCount / metrics.executionCount
      : 0;

    return {
      operationName,
      executionCount: metrics.executionCount,
      averageTime: Math.round(averageTime * 100) / 100,
      minTime: metrics.minTime === Infinity ? 0 : metrics.minTime,
      maxTime: metrics.maxTime,
      errorRate: Math.round(errorRate * 10000) / 100
    };
  }

  /**
   * Gets currently active operations.
   */
  getActiveOperations(): Array<{
    operationId: string;
    startTime: number;
    duration: number;
  }> {
    const now = Date.now();
    const active: Array<{
      operationId: string;
      startTime: number;
      duration: number;
    }> = [];

    for (const [operationId, startTime] of this.activeOperations.entries()) {
      active.push({
        operationId,
        startTime,
        duration: now - startTime
      });
    }

    return active.sort((a, b) => b.duration - a.duration);
  }

  /**
   * Resets all metrics.
   */
  reset(): void {
    this.metrics.clear();
    this.activeOperations.clear();
  }

  /**
   * Gets a summary of all performance data.
   */
  getSummary(): {
    totalOperations: number;
    totalErrors: number;
    averageExecutionTime: number;
    activeOperationCount: number;
    operationTypes: number;
  } {
    let totalOperations = 0;
    let totalErrors = 0;
    let totalTime = 0;

    for (const metrics of this.metrics.values()) {
      totalOperations += metrics.executionCount;
      totalErrors += metrics.errorCount;
      totalTime += metrics.totalTime;
    }

    const averageExecutionTime = totalOperations > 0 ? totalTime / totalOperations : 0;

    return {
      totalOperations,
      totalErrors,
      averageExecutionTime: Math.round(averageExecutionTime * 100) / 100,
      activeOperationCount: this.activeOperations.size,
      operationTypes: this.metrics.size
    };
  }
}

// ============================================================================
// SUPPORTING INTERFACES
// ============================================================================

interface OperationMetrics {
  executionCount: number;
  errorCount: number;
  totalTime: number;
  minTime: number;
  maxTime: number;
  lastExecutionTime: number;
  lastUpdateTime: Date;
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

export class CacheServiceError extends Error implements ProcessingError {
  public readonly code: string;
  public readonly severity: ProcessingErrorSeverity;
  public readonly timestamp: Date;
  public readonly context?: Record<string, any>;

  constructor(
    code: string,
    message: string,
    severity: ProcessingErrorSeverity,
    context?: Record<string, any>
  ) {
    super(message);
    this.name = 'CacheServiceError';
    this.code = code;
    this.severity = severity;
    this.timestamp = new Date();
    this.context = context;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Creates a default cache service with standard configuration.
 */
export function createDefaultCacheService(): CacheService {
  return new CacheService(300000, 1000); // 5 minutes TTL, 1000 max entries
}

/**
 * Creates a high-performance cache service for production use.
 */
export function createHighPerformanceCacheService(): CacheService {
  return new CacheService(600000, 5000); // 10 minutes TTL, 5000 max entries
}

/**
 * Creates a cache service optimized for testing.
 */
export function createTestCacheService(): CacheService {
  return new CacheService(5000, 100); // 5 seconds TTL, 100 max entries
}

/**
 * Creates a default performance monitor.
 */
export function createDefaultPerformanceMonitor(): PerformanceMonitor {
  return new PerformanceMonitor();
}

/**
 * Helper function to create both cache and performance monitor services.
 */
export function createMonitoringServices(): {
  cache: CacheService;
  performance: PerformanceMonitor;
} {
  return {
    cache: createDefaultCacheService(),
    performance: createDefaultPerformanceMonitor()
  };
}
