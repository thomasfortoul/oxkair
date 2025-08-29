/**
 * Data Access Service
 *
 * This service provides access to local database files for medical coding validation:
 * - CCI (Correct Coding Initiative) bundling edits
 * - MUE (Medically Unlikely Edits) thresholds
 * - Global Period indicators
 * - LCD (Local Coverage Determination) policies
 * - Authoritative RVU (Relative Value Unit) data
 */

// Types for the data structures
export interface CCIRecord {
  column1: string;
  column2: string;
  modifierAllowed: boolean;
  effectiveDate: string;
  terminationDate: string | null;
  ptp: string;
}

export interface CCIViolation {
  column1: string;
  column2: string;
  modifierAllowed: boolean;
}

export interface MUEInfo {
  code: string;
  mueValue: number;
  mai: string;
}

export interface GlobalPeriodData {
  code: string;
  globalPeriod: string; // "0", "10", "90", "XXX", etc.
}

export interface LCDMatch {
  lcdId: string;
  title: string;
  link: string;
}

export interface AuthoritativeRVUInfo {
  code: string;
  workRVU: number;
  facilityPracticeExpenseRVU?: number;
  nonFacilityPracticeExpenseRVU?: number;
  malpracticeRVU?: number;
  totalFacilityRVU?: number;
  totalNonFacilityRVU?: number;
  facilityRate?: number;
  nonFacilityRate?: number;
}

export interface LocalityCrosswalkEntry {
  contractor: string;
  locality_number: string;
  state: string;
  area: string;
  counties: string;
}

export interface AnesthesiaConversionFactor {
  contractor: string;
  locality: string;
  name: string;
  conversion_factor: number;
}

import { promises as fs } from 'fs';
import path from 'path';
import type { EnhancedDiagnosisCode, EnhancedProcedureCode } from '../agents/newtypes';

class DataAccessService {
  private baseDir: string;
  private cache = new Map<string, unknown>();
  private isServerless: boolean;

  constructor() {
    // Detect serverless environment
    this.isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.FUNCTIONS_RUNTIME);
    
    // Set appropriate base directory
    if (this.isServerless) {
      // In serverless environments, try different possible paths
      this.baseDir = path.join(process.cwd(), 'public', 'coder', 'data');
    } else {
      this.baseDir = path.join(process.cwd(), 'public', 'coder', 'data');
    }
    
    console.log(`[DataAccess] Initialized for ${this.isServerless ? 'serverless' : 'local'} environment, baseDir: ${this.baseDir}`);
  }

  /**
   * Fetches JSON data from a file
   */
  private async fetchJsonData<T>(relativePath: string): Promise<T> {
    try {
      console.log(`[DataAccess] fetchJsonData called with path:`, relativePath);
      if (this.cache.has(relativePath)) {
        console.log(`[DataAccess] fetchJsonData cache hit for`, relativePath);
        return this.cache.get(relativePath) as T;
      }
      const filePath = path.join(this.baseDir, relativePath);
      const fileContents = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(fileContents) as T;
      let dataSummary: string;
      if (Array.isArray(data)) {
        dataSummary = `Array with ${data.length} items`;
      } else if (typeof data === 'object' && data !== null) {
        dataSummary = `Object with keys: ${Object.keys(data).join(', ')}`;
      } else {
        dataSummary = typeof data;
      }
      console.log(`[DataAccess] fetchJsonData successful for`, relativePath, ':', dataSummary);
      this.cache.set(relativePath, data);
      return data;
    } catch (error) {
      console.error(`[DataAccess] fetchJsonData failed for ${relativePath}:`, error);
      
      // In serverless environments, return empty data instead of throwing
      if (this.isServerless) {
        console.warn(`[DataAccess] Serverless environment - returning empty data for ${relativePath}`);
        return (Array.isArray([]) ? [] : {}) as T;
      }
      
      throw error;
    }
  }

  /**
   * Checks for CCI edits between procedure codes
   */
  async checkCCIEdits(procedureCodes: EnhancedProcedureCode[]): Promise<CCIViolation[]> {
    try {
      console.log('[DataAccess] checkCCIEdits called with codes:', procedureCodes.map(p => p.code));
      const cciData = await this.fetchJsonData<Record<string, CCIRecord[]>>('CCI/cci_practitioner.json');
      const violations: CCIViolation[] = [];

      for (let i = 0; i < procedureCodes.length; i++) {
        const code1 = procedureCodes[i].code;
        if (cciData[code1]) {
          for (let j = 0; j < procedureCodes.length; j++) {
            if (i !== j) {
              const code2 = procedureCodes[j].code;
              const cciRecord = cciData[code1].find(record =>
                record.column2 === code2 &&
                (!record.terminationDate || new Date(record.terminationDate) > new Date())
              );
              if (cciRecord) {
                violations.push({ column1: code1, column2: code2, modifierAllowed: cciRecord.modifierAllowed });
              }
            }
          }
        }
      }

      console.log('[DataAccess] checkCCIEdits result:', violations.length, 'violations');
      return violations;
    } catch (error) {
      console.error('Error checking CCI edits:', error);
      return [];
    }
  }

  /**
   * Gets MUE values for procedure codes
   */
  async getMUEValues(procedureCodes: EnhancedProcedureCode[]): Promise<MUEInfo[]> {
    try {
      console.log('[DataAccess] getMUEValues called with codes:', procedureCodes.map(p => p.code));
      const mueInfo: MUEInfo[] = [];
      const notFoundCodes: string[] = [];

      // First, try to get individual MUE files for each code
      for (const procedureCode of procedureCodes) {
        try {
          const individualData = await this.fetchJsonData<{ code: string; max_units?: number; mueValue?: number; adjudication_indicator?: string; mai?: string }>(`MUE/practitioner_codes/${procedureCode.code}.json`);
          
          if (individualData) {
            mueInfo.push({ 
              code: individualData.code || procedureCode.code, 
              mueValue: individualData.max_units || individualData.mueValue || 0, 
              mai: individualData.adjudication_indicator || individualData.mai || "" 
            });
            console.log(`[DataAccess] Found individual MUE file for code: ${procedureCode.code}`);
          } else {
            notFoundCodes.push(procedureCode.code);
          }
        } catch (error) {
          // Individual file not found, add to fallback list
          notFoundCodes.push(procedureCode.code);
          console.log(`[DataAccess] Individual MUE file not found for code: ${procedureCode.code}, will check bulk data`);
        }
      }

      // For codes not found individually, fall back to bulk data
      if (notFoundCodes.length > 0) {
        try {
          console.log(`[DataAccess] Checking bulk MUE data for ${notFoundCodes.length} codes`);
          const mueData = await this.fetchJsonData<Array<{ code: string; max_units: number; adjudication_indicator: string }>>('MUE/mue_practitioners.json');
          const lookup = new Map(mueData.map(m => [m.code, m]));

          for (const code of notFoundCodes) {
            const entry = lookup.get(code);
            if (entry) {
              mueInfo.push({ code: entry.code, mueValue: entry.max_units, mai: entry.adjudication_indicator });
              console.log(`[DataAccess] Found MUE data in bulk file for code: ${code}`);
            }
          }
        } catch (bulkError) {
          console.warn('[DataAccess] Error loading bulk MUE data:', bulkError);
        }
      }

      console.log('[DataAccess] getMUEValues result:', mueInfo.length, 'values');
      return mueInfo;
    } catch (error) {
      console.error('Error getting MUE values:', error);
      return [];
    }
  }

  /**
   * Gets global period data for procedure codes
   */
  async getGlobalPeriods(procedureCodes: EnhancedProcedureCode[]): Promise<GlobalPeriodData[]> {
    try {
      console.log('[DataAccess] getGlobalPeriods called with codes:', procedureCodes.map(p => p.code));
      const globalData = await this.fetchJsonData<Array<{ hcpcs: string; global: string }>>('Global/global_periods_processed.json');
      const lookup = new Map(globalData.map(g => [g.hcpcs, g.global]));
      const globalPeriods: GlobalPeriodData[] = [];

      for (const procedureCode of procedureCodes) {
        const period = lookup.get(procedureCode.code);
        if (period) {
          globalPeriods.push({ code: procedureCode.code, globalPeriod: period });
        }
      }

      console.log('[DataAccess] getGlobalPeriods result:', globalPeriods.length, 'periods');
      return globalPeriods;
    } catch (error) {
      console.error('Error getting global periods:', error);
      return [];
    }
  }

  /**
   * Gets the global period for a single procedure code
   */
  async getGlobalPeriod(code: string): Promise<string | null> {
    try {
      const data = await this.fetchJsonData<Array<{ hcpcs: string; global: string }>>(
        'Global/global_periods_processed.json'
      )
      const entry = data.find(r => r.hcpcs === code)
      return entry ? entry.global : null
    } catch (error) {
      console.error('Error getting global period for', code, ':', error)
      return null
    }
  }

  /**
   * Finds applicable LCD policies for diagnosis and procedure codes
   */
  async findApplicableLCDs(diagnosisCodes: EnhancedDiagnosisCode[], procedureCodes: EnhancedProcedureCode[]): Promise<LCDMatch[]> {
    try {
      console.log('[DataAccess] findApplicableLCDs called with diagnosis codes:', diagnosisCodes.map(d => d.code), 'and procedure codes:', procedureCodes.map(p => p.code));
      const lcdData = await this.fetchJsonData<Array<{ id: string; title: string; link: string; icdCodes?: string[]; cptCodes?: string[] }>>('LCD/lcd_report_processed.json');

      const matches: LCDMatch[] = [];
      const diagnosisCodeValues = diagnosisCodes.map(dc => dc.code);
      const procedureCodeValues = procedureCodes.map(pc => pc.code);

      for (const lcd of lcdData) {
        let isMatch = false;
        if (lcd.icdCodes && lcd.icdCodes.some(icdCode => diagnosisCodeValues.includes(icdCode))) {
          isMatch = true;
        }
        if (!isMatch && lcd.cptCodes && lcd.cptCodes.some(cptCode => procedureCodeValues.includes(cptCode))) {
          isMatch = true;
        }
        if (isMatch) {
          matches.push({ lcdId: lcd.id, title: lcd.title, link: lcd.link });
        }
      }

      console.log('[DataAccess] findApplicableLCDs result:', matches.length, 'matches');
      return matches;
    } catch (error) {
      console.error('Error finding applicable LCDs:', error);
      return [];
    }
  }

  /**
   * Gets LCD policy details from HTML file
   */
  async getLCDPolicyDetails(lcdId: string): Promise<string | null> {
    try {
      console.log('[DataAccess] getLCDPolicyDetails called with lcdId:', lcdId);
      
      // In serverless environments, return null for LCD policy details
      if (this.isServerless) {
        console.warn(`[DataAccess] Serverless environment - LCD policy details not available for: ${lcdId}`);
        return null;
      }
      
      const filePath = path.join(this.baseDir, 'LCD', 'downloaded_pages', `${lcdId}.html`);
      const text = await fs.readFile(filePath, 'utf8');
      console.log('[DataAccess] getLCDPolicyDetails result for', lcdId, ':', text ? (text.substring(0, 200) + (text.length > 200 ? '...' : '')) : null);
      return text;
    } catch (error) {
      console.error('[DataAccess] getLCDPolicyDetails failed for', lcdId, ':', error);
      return null;
    }
  }

  /**
   * Gets authoritative RVU data for a procedure code
   */
  async getAuthoritativeRVUData(cptCode: string): Promise<AuthoritativeRVUInfo | null> {
    try {
      console.log('[DataAccess] getAuthoritativeRVUData called with code:', cptCode);
      const rvuData = await this.fetchJsonData<Record<string, AuthoritativeRVUInfo>>('RVU/physician_fee_schedule_processed.json');

      if (rvuData[cptCode]) {
        console.log('[DataAccess] getAuthoritativeRVUData result for', cptCode, ':', rvuData[cptCode]);
        return rvuData[cptCode];
      }

      console.log('[DataAccess] getAuthoritativeRVUData result for', cptCode, ': null');
      return null;
    } catch (error) {
      console.error(`Error getting authoritative RVU data for ${cptCode}:`, error);
      return null;
    }
  }

  /**
   * Looks up a locality crosswalk record
   */
  async getLocalityCrosswalk(contractor: string, locality: string): Promise<LocalityCrosswalkEntry | null> {
    const data = await this.fetchJsonData<LocalityCrosswalkEntry[]>('RVU/location_crosswalk.json');
    const match = data.find(r => r.contractor === contractor && r.locality_number === locality);
    return match || null;
  }

  /**
   * Gets the anesthesia conversion factor for a locality
   */
  async getAnesthesiaConversionFactor(contractor: string, locality: string): Promise<number | null> {
    const data = await this.fetchJsonData<AnesthesiaConversionFactor[]>('RVU/anesthesia_cf.json');
    const match = data.find(r => r.contractor === contractor && r.locality === locality);
    return match ? match.conversion_factor : null;
  }

  /**
   * Retrieves national RVU values for a CPT/HCPCS code
   */
  async getNationalRVU(code: string): Promise<{ work_rvu: number; pe_rvu: number; mp_rvu: number; conversion_factor: number; global_period: string } | null> {
    const data = await this.fetchJsonData<Array<{ hcpcs: string; work_rvu: number; pe_rvu: number; mp_rvu: number; conversion_factor: number; global_period: string }>>('RVU/national_rvu.json');
    const match = data.find(r => r.hcpcs === code);
    return match || null;
  }

  /**
   * Gets GPCI values for a locality id
   */
  async getGPCI(locality: string): Promise<{ work_gpci: number; pe_gpci: number; mp_gpci: number } | null> {
    const data = await this.fetchJsonData<Record<string, { work_gpci: number; pe_gpci: number; mp_gpci: number }>>('RVU/gpci.json');
    return data[locality] || null;
  }

  /**
   * Retrieves carrier specific RVU/pricing record
   */
  async getCarrierRVU(code: string, contractor: string, locality: string, modifier: string | null): Promise<{ non_facility_price: number; facility_price: number; global_period: string } | null> {
    const data = await this.fetchJsonData<Array<{ code: string; contractor: string; locality: string; modifier: string | null; non_facility_price: number; facility_price: number; global_period: string }>>('PFS/pfs_sample.json');
    const match = data.find(r =>
      r.code === code &&
      r.contractor === contractor &&
      r.locality === locality &&
      (r.modifier || null) === (modifier || null)
    );
    return match || null;
  }

  /**
   * Retrieves locality-specific RVU payment for a CPT code
   */
  async getLocalityPayment(cptCode: string, contractor: string, locality: string, facility: boolean): Promise<number | null> {
    const rvuRows = await this.fetchJsonData<Array<{ HCPCS: string; CARRIER: number; LOCALITY: number; 'FACILITY PRICE': number; 'NON-FACILTY PRICE': number }>>('RVU/processed_hcpcs.json');
    const row = rvuRows.find(r => r.HCPCS === cptCode && String(r.CARRIER) === contractor && String(r.LOCALITY) === locality);
    if (!row) return null;
    return facility ? row['FACILITY PRICE'] : row['NON-FACILTY PRICE'];
  }
}

// Export a singleton instance
const dataAccessService = new DataAccessService();
export default dataAccessService;
