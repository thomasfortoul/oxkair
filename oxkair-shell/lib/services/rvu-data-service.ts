/**
 * RVU Data Service Implementation
 *
 * This service handles loading and caching of RVU-related data including:
 * - HCPCS records with RVU values
 * - GPCI (Geographic Practice Cost Index) data
 * - Locality crosswalk data
 * - Data validation and integrity checks
 */

import {
  RVUDataService,
  HCPCSRecord,
  GPCIData,
  LocalityCrosswalk,
  LocalityInfo,
  ValidationResult,
  AzureStorageService,
} from "../agents/types.ts";
import { WorkflowLogger } from "../../app/coder/lib/logging.ts";
import { AzureStorageServiceImpl } from "./azure-storage-service.ts";

export class RVUDataServiceImpl implements RVUDataService {
  private hcpcsCache = new Map<string, HCPCSRecord>();
  private gpciData: GPCIData | null = null;
  private logger: WorkflowLogger;
  private azureStorageService: AzureStorageService;
  private initialized = false;

  constructor(logger?: WorkflowLogger, azureStorageService?: AzureStorageService) {
    this.logger = logger || new WorkflowLogger();
    this.azureStorageService = azureStorageService || new AzureStorageServiceImpl(this.logger);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.logger.logInfo("RVUDataService", "Initializing RVU data service...");

      // Pre-load GPCI data
      await this.loadGPCIData();

      this.initialized = true;
      this.logger.logInfo(
        "RVUDataService",
        "RVU data service initialized successfully",
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.logError(
        "RVUDataService",
        "Failed to initialize RVU data service",
        { error: errorMessage },
      );
      throw error;
    }
  }

  async loadHCPCSRecord(code: string): Promise<HCPCSRecord | null> {
    try {
      // Check cache first
      if (this.hcpcsCache.has(code)) {
        this.logger.logDebug(
          "RVUDataService",
          `HCPCS record for ${code} found in cache`,
        );
        return this.hcpcsCache.get(code)!;
      }

      // Load from Azure Storage
      const filePath = `RVU/hcpcs_records/${code}.json`;

      if (!(await this.azureStorageService.fileExists(filePath))) {
        this.logger.logWarn(
          "RVUDataService",
          `HCPCS record file not found for code: ${code}`,
        );
        return null;
      }

      const fileContent = await this.azureStorageService.getFileContent(filePath);
      const rawData = JSON.parse(fileContent);

      // Transform the data to match our interface
      const hcpcsRecord: HCPCSRecord = {
        code: code,
        description: rawData.description || "",
        work_rvu: parseFloat(rawData["MEDICARE - RVU"]) || 0,
        pe_rvu: parseFloat(rawData["WORK - PE RVU"]) || 0,
        mp_rvu: 0,
        total_rvu: parseFloat(rawData["MEDICARE - RVU"]) || 0,
        conversion_factor: parseFloat(rawData["CONVERSION FACTOR"]) || 37.7975, // 2024 default
        status: rawData.status || "active",
      };

      // Cache the record
      this.hcpcsCache.set(code, hcpcsRecord);

      this.logger.logDebug(
        "RVUDataService",
        `Successfully loaded HCPCS record for ${code}`,
        {
          totalRVU: hcpcsRecord.total_rvu,
          workRVU: hcpcsRecord.work_rvu,
        },
      );

      return hcpcsRecord;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.logError(
        "RVUDataService",
        `Failed to load HCPCS record for ${code}`,
        { error: errorMessage },
      );
      return null;
    }
  }

  async loadGPCIData(): Promise<GPCIData> {
    if (this.gpciData) {
      return this.gpciData;
    }

    try {
      const filePath = "RVU/gpci_output.json";
      
      if (!(await this.azureStorageService.fileExists(filePath))) {
        throw new Error(`GPCI data file not found at ${filePath}`);
      }

      const fileContent = await this.azureStorageService.getFileContent(filePath);

      // Handle NaN values in JSON by replacing them with null before parsing
      const cleanedContent = fileContent.replace(/:\s*NaN/g, ": null");

      const rawData = JSON.parse(cleanedContent);

      // Filter out invalid entries and transform to proper format
      this.gpciData = {};

      if (Array.isArray(rawData)) {
        for (const item of rawData) {
          for (const [, value] of Object.entries(item)) {
            // Type guard for the value structure
            if (
              value &&
              typeof value === "object" &&
              "State" in value &&
              "Locality Number" in value &&
              "PWGPCI" in value &&
              "PEGPCI" in value &&
              "MPGPCI" in value &&
              value.State !== null &&
              value["Locality Number"] !== null &&
              !isNaN(Number(value["Locality Number"]))
            ) {
              const localityNumber = String(
                Math.floor(Number(value["Locality Number"])),
              );
              this.gpciData[localityNumber] = {
                work: Number(value.PWGPCI) || 1.0,
                pe: Number(value.PEGPCI) || 1.0,
                mp: Number(value.MPGPCI) || 1.0,
                state: String(value.State),
                locality_name: String(value["Locality Number"] || ""),
              };
            }
          }
        }
      }

      this.logger.logInfo("RVUDataService", "Successfully loaded GPCI data", {
        localityCount: Object.keys(this.gpciData).length,
      });

      return this.gpciData;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.logError("RVUDataService", "Failed to load GPCI data", {
        error: errorMessage,
      });
      throw error;
    }
  }

  async loadLocalityCrosswalk(): Promise<LocalityCrosswalk> {
    // Locality crosswalk functionality removed - return empty object
    this.logger.logInfo(
      "RVUDataService",
      "Locality crosswalk functionality disabled",
    );
    return {};
  }

  async getLocalityInfo(contractor: string): Promise<LocalityInfo | null> {
    // Return default locality info since crosswalk is disabled
    this.logger.logInfo(
      "RVUDataService",
      `Using default locality for contractor: ${contractor}`,
    );

    const gpciData = await this.loadGPCIData();

    // Use national average (locality 00) or first available locality
    const defaultLocalityNumber = "00";
    let gpciFactors = gpciData[defaultLocalityNumber];

    if (!gpciFactors) {
      // Use first available locality if national average not found
      const firstLocality = Object.keys(gpciData)[0];
      if (firstLocality) {
        gpciFactors = gpciData[firstLocality];
      } else {
        // Fallback to 1.0 factors
        gpciFactors = {
          work: 1.0,
          pe: 1.0,
          mp: 1.0,
          state: "NA",
          locality_name: "Default",
        };
      }
    }

    return {
      localityNumber: defaultLocalityNumber,
      state: gpciFactors.state,
      description: gpciFactors.locality_name,
      gpci: {
        work: gpciFactors.work,
        pe: gpciFactors.pe,
        mp: gpciFactors.mp,
      },
    };
  }

  async cacheRVUData(codes: string[]): Promise<void> {
    this.logger.logInfo(
      "RVUDataService",
      `Pre-caching RVU data for ${codes.length} codes`,
    );

    const promises = codes.map((code) => this.loadHCPCSRecord(code));
    const results = await Promise.allSettled(promises);

    const successful = results.filter(
      (result) => result.status === "fulfilled",
    ).length;
    const failed = results.filter(
      (result) => result.status === "rejected",
    ).length;

    this.logger.logInfo("RVUDataService", "RVU data caching completed", {
      totalCodes: codes.length,
      successful,
      failed,
      cacheSize: this.hcpcsCache.size,
    });
  }

  async validateDataIntegrity(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check if GPCI data file exists
      const gpciFilePath = "RVU/gpci_output.json";
      if (!(await this.azureStorageService.fileExists(gpciFilePath))) {
        errors.push(`GPCI data file not found: ${gpciFilePath}`);
      }

      // Check if HCPCS records directory has files
      try {
        const hcpcsFiles = await this.azureStorageService.listFiles("RVU/hcpcs_records");
        if (hcpcsFiles.length === 0) {
          errors.push("HCPCS records directory is empty");
        } else {
          this.logger.logDebug(
            "RVUDataService",
            `Found ${hcpcsFiles.length} HCPCS record files`,
          );
        }
      } catch (error) {
        errors.push(`Failed to list HCPCS records: ${error instanceof Error ? error.message : "Unknown error"}`);
      }

      // If basic files exist, perform deeper validation
      if (errors.length === 0) {
        try {
          const gpciData = await this.loadGPCIData();

          // Validate GPCI data structure
          const gpciLocalityCount = Object.keys(gpciData).length;
          if (gpciLocalityCount === 0) {
            errors.push("GPCI data is empty");
          } else {
            this.logger.logDebug(
              "RVUDataService",
              `GPCI data contains ${gpciLocalityCount} localities`,
            );
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          errors.push(`Data validation failed: ${errorMessage}`);
        }
      }

      const result: ValidationResult = {
        isValid: errors.length === 0,
        errors,
        warnings,
      };

      this.logger.logInfo(
        "RVUDataService",
        "Data integrity validation completed",
        {
          isValid: result.isValid,
          errorCount: errors.length,
          warningCount: warnings.length,
        },
      );

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        isValid: false,
        errors: [`Validation process failed: ${errorMessage}`],
        warnings: [],
      };
    }
  }

  // Utility methods
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.hcpcsCache.size,
      keys: Array.from(this.hcpcsCache.keys()),
    };
  }

  clearCache(): void {
    this.hcpcsCache.clear();
    this.logger.logInfo("RVUDataService", "Cache cleared");
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}
