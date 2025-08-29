// oxkair-shell/lib/services/retrieval-service.ts

import OpenAI from 'openai';
import { RetrievalService as IRetrievalService } from './service-types';


export class RetrievalService implements IRetrievalService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async findRvu(hcpcsCode: string): Promise<number | null> {
    const rvuVectorStoreId = process.env.RVU_VECTOR_STORE_ID;
    if (!rvuVectorStoreId) {
      console.error("RVU_VECTOR_STORE_ID is not set.");
      return null;
    }

    try {
      // UPDATED: Use semantic search without attribute filtering.
      const { data: results } = await this.openai.vectorStores.search(
        rvuVectorStoreId,
        {
          query: hcpcsCode, // Simple query with the code
          max_num_results: 1
        }
      );

      if (results && results.length > 0) {
        // The content is now directly on the result objects in the data array
        const contentText = results[0].content[0].text;
        const parsedContent = JSON.parse(contentText);
        const rvu = parsedContent["MEDICARE - RVU"];
        return typeof rvu === 'number' ? rvu : null;
      }
      return null;
    } catch (error) {
      console.error(`Error fetching RVU for ${hcpcsCode}:`, error);
      return null;
    }
  }

  async searchLCDPolicies(
    query: string,
    maxResults: number,
  ): Promise<any[]> {
    const lcdVectorStoreId = process.env.LCD_VECTOR_STORE_ID;
    if (!lcdVectorStoreId) {
      console.error("LCD_VECTOR_STORE_ID is not set.");
      return [];
    }

    try {
      const { data: results } = await this.openai.vectorStores.search(
        lcdVectorStoreId,
        {
          query: query,
          max_num_results: maxResults, // SHOULD BE 5
        },
      );
      // Return the entire result objects instead of just content
      return results;
    } catch (error) {
      console.error(`Error searching LCD policies for query "${query}":`, error);
      return [];
    }
  }
}