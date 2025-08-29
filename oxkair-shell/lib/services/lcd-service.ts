

import { LCDPolicy, LCDServiceMetrics,
  RetrievalResult } from './service-types';

export interface LCDService {
  fetchLCDPolicies(
    query: {
      codes: { code: string; description?: string }[];
      macJurisdiction: string;
      noteText: string;
      dateOfService: string;
    },
    maxResults: number,
  ): Promise<RetrievalResult[]>;

  getCachedPolicy(policyId: string): Promise<LCDPolicy | null>;
  cachePolicy(policy: LCDPolicy): Promise<void>;

  validateJurisdiction(jurisdiction: string): boolean;
  getJurisdictionByZip(zipCode: string): Promise<string>;

  // Health check and monitoring
  healthCheck(): Promise<boolean>;
  getMetrics(): Promise<LCDServiceMetrics>;
}