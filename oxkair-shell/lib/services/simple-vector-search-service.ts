/**
 * Simple Vector Search Service - TypeScript implementation of Azure RAG Python functionality
 * 
 * This service provides a lightweight interface to Azure Search for vector-based queries.
 * It's designed to replace the complex vector search with a simple AI model + vector search approach.
 */

import { z } from "zod";
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Environment configuration
interface VectorSearchConfig {
  endpoint: string;
  indexName: string;
  searchKey?: string;
}

// Search result schema
const SearchResultSchema = z.object({
  query: z.string(),
  approx_total_count: z.number().nullable(),
  parent_ids: z.array(z.string()),
  results: z.array(z.any())
});

type SearchResult = z.infer<typeof SearchResultSchema>;

export interface VectorSearchOptions {
  query: string;
  indexName: string;
  queryType?: 'simple' | 'semantic';
  top?: number;
  includeTotal?: boolean;
}

export class SimpleVectorSearchService {
  private config: VectorSearchConfig;

  constructor(config?: Partial<VectorSearchConfig>) {
    this.config = {
      endpoint: config?.endpoint || "https://oxkairsearchdb.search.windows.net",
      indexName: config?.indexName || "updated-cpt",
      searchKey: config?.searchKey || process.env.SEARCH_KEY
    };

    if (!this.config.searchKey) {
      throw new Error("SEARCH_KEY must be provided in .env.local file");
    }
  }

  /**
   * Performs a vector search using Azure Search
   */
  async search(options: VectorSearchOptions): Promise<SearchResult> {
    const {
      query,
      indexName = this.config.indexName,
      queryType = 'semantic',
      top = 5,
      includeTotal = true
    } = options;

    try {
      // Prepare headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (this.config.searchKey) {
        headers['api-key'] = this.config.searchKey;
      }

      // Make the search request using the same approach as the Python script
      const url = `${this.config.endpoint}/indexes/${indexName}/docs/search?api-version=2023-11-01`;
      
      const requestBody = {
        search: query,
        queryType: queryType,
        top: top,
        count: includeTotal
      };

      // Note: Logging is handled by the calling agent
      
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`Search request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Transform the response to match our expected format
      const results = data.value || [];
      const approxCount = data['@odata.count'] || null;

      // Extract parent IDs
      const parentIds: string[] = [];
      const seen = new Set<string>();
      
      for (const doc of results) {
        if (doc && typeof doc === 'object') {
          const pid = doc.parent_id;
          if (pid !== null && pid !== undefined) {
            const pidStr = String(pid);
            if (!seen.has(pidStr)) {
              seen.add(pidStr);
              parentIds.push(pidStr);
            }
          }
        }
      }

      // Remove text_vector fields from results
      const cleanedResults = results.map((result: any) => this.removeTextVector(result));

      const searchResult: SearchResult = {
        query,
        approx_total_count: approxCount,
        parent_ids: parentIds,
        results: cleanedResults
      };

      return searchResult;

    } catch (error) {
      console.error('Vector search failed:', error);
      throw new Error(`Vector search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Recursively removes text_vector fields from objects
   */
  private removeTextVector(obj: any, targetKey: string = 'text_vector'): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.removeTextVector(item, targetKey));
    }

    if (typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (key !== targetKey) {
          result[key] = this.removeTextVector(value, targetKey);
        }
      }
      return result;
    }

    return obj;
  }

  /**
   * Convenience method for CPT code searches
   */
  async searchCPTCodes(query: string, top: number = 5): Promise<SearchResult> {
    return this.search({
      query,
      indexName: this.config.indexName,
      queryType: 'semantic',
      top,
      includeTotal: true
    });
  }
}