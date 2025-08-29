import {
  AzureStorageService,
  CCIDataService,
} from "@/lib/agents/newtypes";
import { GLOBAL_PERIOD_DESCRIPTIONS } from "./service-types";
import { CCIEdit, MUEEntry, GlobalEntry } from "./cci-types";
import { CacheService } from "@/lib/services/cache-service";

export class CCIDataServiceImpl implements CCIDataService {
  private cciCache = new Map<string, CCIEdit[]>();
  private mueCache = new Map<string, MUEEntry[]>();
  private individualMueCache = new Map<string, MUEEntry | null>();
  private globalCache: GlobalEntry[] | null = null;

  constructor(
    private cacheService: CacheService,
    private azureStorageService: AzureStorageService,
  ) {}

  async loadMUEData(
    serviceType: "hospital" | "practitioner" | "dme",
  ): Promise<MUEEntry[]> {
    const cacheKey = `mue_${serviceType}`;

    if (this.mueCache.has(cacheKey)) {
      return this.mueCache.get(cacheKey)!;
    }

    try {
      const filePath = `MUE/mue_${serviceType}.json`;
      const fileContent =
        await this.azureStorageService.getFileContent(filePath);
      const data = JSON.parse(fileContent);
      this.mueCache.set(cacheKey, data);
      return data;
    } catch (error: any) {
      throw new Error(
        `Error loading MUE data for ${serviceType}: ${error.message}`,
      );
    }
  }

  async loadGlobalData(): Promise<GlobalEntry[]> {
    if (this.globalCache) {
      return this.globalCache;
    }

    try {
      const filePath = "Global/global_periods_processed.json";
      const fileContent =
        await this.azureStorageService.getFileContent(filePath);
      const data = JSON.parse(fileContent);
      this.globalCache = data;
      return data;
    } catch (error: any) {
      throw new Error(`Error loading Global data: ${error.message}`);
    }
  }

  async getCCIEditsForCode(
    code: string,
    serviceType: "hospital" | "practitioner",
  ): Promise<{ edits: CCIEdit[]; status: "found" | "not_found" | "error"; message?: string }> {
    const cacheKey = `${serviceType}_${code}`;
    if (this.cciCache.has(cacheKey)) {
      return { edits: this.cciCache.get(cacheKey)!, status: "found" };
    }

    try {
      const filePath = `CCI/${code}.json`;
      const fileContent =
        await this.azureStorageService.getFileContent(filePath);
      const data = JSON.parse(fileContent);
      this.cciCache.set(cacheKey, data);
      return { edits: data, status: "found" };
    } catch (error: any) {
      if (error.code === "ENOENT" || error.statusCode === 404) {
        // File not found - this is expected for codes without CCI edits
        console.info(
          `CCI data file not found for ${serviceType} code ${code}. Skipping PTP edits for this code.`,
        );
        this.cciCache.set(cacheKey, []);
        return { 
          edits: [], 
          status: "not_found", 
          message: `CCI data file not found for code ${code}. PTP edits skipped.` 
        };
      }
      
      // Other errors (network, parsing, etc.) should still be thrown
      throw new Error(
        `Error loading CCI data for ${serviceType} code ${code}: ${error.message}`,
      );
    }
  }

  async getMUEForCode(
    code: string,
    serviceType: string,
  ): Promise<MUEEntry | null> {
    const cacheKey = `${serviceType}_${code}`;
    
    // Check individual MUE cache first
    if (this.individualMueCache.has(cacheKey)) {
      return this.individualMueCache.get(cacheKey)!;
    }

    // First try to get MUE data from individual code file
    try {
      const individualFilePath = `MUE/${serviceType}_codes/${code}.json`;
      const fileContent = await this.azureStorageService.getFileContent(individualFilePath);
      const data = JSON.parse(fileContent);
      
      // Return the MUE entry from individual file
      if (data && typeof data === 'object') {
        const mueEntry: MUEEntry = {
          code: data.code || code,
          max_units: data.max_units || data.mueValue,
          adjudication_indicator: data.adjudication_indicator || data.mai || "",
          rationale: data.rationale || "",
          service_type: serviceType,
        };
        
        // Cache the result
        this.individualMueCache.set(cacheKey, mueEntry);
        return mueEntry;
      }
    } catch (error: any) {
      if (error.code === "ENOENT" || error.statusCode === 404) {
        // File not found - fall back to bulk data
        console.info(`Individual MUE file not found for ${serviceType} code ${code}. Falling back to bulk data.`);
      } else {
        console.warn(`Error loading individual MUE file for ${serviceType} code ${code}: ${error.message}`);
      }
    }

    // Fallback to bulk MUE data
    try {
      const mueData = await this.loadMUEData(
        serviceType as "hospital" | "practitioner" | "dme",
      );
      const bulkEntry = mueData.find((entry) => entry.code === code) || null;
      
      // Cache the result (even if null)
      this.individualMueCache.set(cacheKey, bulkEntry);
      return bulkEntry;
    } catch (error: any) {
      console.warn(`Error loading bulk MUE data for ${serviceType}: ${error.message}`);
      
      // Cache null result to avoid repeated failed lookups
      this.individualMueCache.set(cacheKey, null);
      return null;
    }
  }

  async getGlobalPeriodForCode(code: string): Promise<GlobalEntry | null> {
    try {
      // First try to get global period from RVU/hcpcs_records/<code>.json
      const filePath = `RVU/hcpcs_records/${code}.json`;
      
      if (await this.azureStorageService.fileExists(filePath)) {
        const fileContent = await this.azureStorageService.getFileContent(filePath);
        const rawData = JSON.parse(fileContent);
        
        // Extract the "GLOB - DAYS" field
        const globalPeriod = rawData["GLOB - DAYS"];
        
        if (globalPeriod !== undefined && globalPeriod !== null) {
          return {
            hcpcs: code,
            desc: rawData.description || "",
            global: String(globalPeriod),
            status: "A", // Assume active if found in RVU records
            globalDescription: this.getGlobalPeriodDescription(String(globalPeriod))
          };
        }
      }
      
      // Fallback to the original global periods data
      const globalData = await this.loadGlobalData();
      const entry = globalData.find(
        (entry) => entry.hcpcs === code && entry.status === "A",
      );
      
      if (entry) {
        return {
          ...entry,
          globalDescription: this.getGlobalPeriodDescription(entry.global)
        };
      }
      
      return null;
    } catch (error: any) {
      console.warn(`Error loading global period for code ${code}: ${error.message}`);
      
      // Fallback to the original global periods data
      try {
        const globalData = await this.loadGlobalData();
        const entry = globalData.find(
          (entry) => entry.hcpcs === code && entry.status === "A",
        );
        
        if (entry) {
          return {
            ...entry,
            globalDescription: this.getGlobalPeriodDescription(entry.global)
          };
        }
      } catch (fallbackError: any) {
        console.warn(`Fallback global period lookup also failed for code ${code}: ${fallbackError.message}`);
      }
      
      return null;
    }
  }

  private getGlobalPeriodDescription(globalPeriod: string): string {
    return GLOBAL_PERIOD_DESCRIPTIONS[globalPeriod] || `Global period: ${globalPeriod} days`;
  }
}
