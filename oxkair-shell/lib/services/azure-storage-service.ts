import { BlobServiceClient, ContainerClient } from "@azure/storage-blob";
import { WorkflowLogger } from "../../app/coder/lib/logging";
import dotenv from "dotenv";
dotenv.config({ path: '.env.local' });

export interface IAzureStorageService {
  getFileContent(filePath: string): Promise<string>;
  fileExists(filePath: string): Promise<boolean>;
  listFiles(directoryPath: string): Promise<string[]>;
  listFilesByName(prefixKey: string): Promise<string[]>;
  clearCache(): void;
  getCacheStats(): { size: number; hitRate: number };
}

export class AzureStorageServiceImpl implements IAzureStorageService {
  private blobServiceClient: BlobServiceClient;
  private containerClient: ContainerClient;
  private cache = new Map<string, { content: string; timestamp: number }>();
  private cacheHits = 0;
  private cacheRequests = 0;
  private logger: WorkflowLogger;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly CONTAINER_NAME = "data";

  constructor(logger?: WorkflowLogger) {
    this.logger = logger || new WorkflowLogger();
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const sasUrl = process.env.AZURE_URL;

    if (connectionString) {
      this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
      this.logger.logInfo("AzureStorageService", "Initialized with connection string");
    } else if (sasUrl) {
      this.blobServiceClient = new BlobServiceClient(sasUrl);
      this.logger.logInfo("AzureStorageService", "Initialized with SAS URL");
    } else {
      const error = "Azure Storage configuration missing. Please set AZURE_STORAGE_CONNECTION_STRING or AZURE_SAS_URL environment variable.";
      this.logger.logError("AzureStorageService", error);
      throw new Error(error);
    }

    this.containerClient = this.blobServiceClient.getContainerClient(this.CONTAINER_NAME);
  }

  async getFileContent(filePath: string): Promise<string> {
    const startTime = Date.now();
    this.cacheRequests++;

    try {
      const cached = this.getCachedContent(filePath);
      if (cached) {
        this.cacheHits++;
        this.logger.logDebug("AzureStorageService", `Cache hit for ${filePath}`, { source: "cache", timeTaken: Date.now() - startTime });
        return cached;
      }

      this.logger.logDebug("AzureStorageService", `Fetching ${filePath} from Azure`);
      const blobClient = this.containerClient.getBlobClient(filePath);
      const downloadResponse = await blobClient.download();

      if (!downloadResponse.readableStreamBody) {
        throw new Error(`No content stream for ${filePath}`);
      }

      const content = await this.streamToString(downloadResponse.readableStreamBody);
      this.setCachedContent(filePath, content);

      this.logger.logInfo("AzureStorageService", `Successfully fetched ${filePath}`, {
        source: "Azure",
        timeTaken: Date.now() - startTime,
        contentLength: content.length
      });

      return content;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.logError("AzureStorageService", `Failed to fetch ${filePath}`, { error: errorMessage });
      throw new Error(`Failed to fetch ${filePath} from Azure Storage: ${errorMessage}`);
    }
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      const blobClient = this.containerClient.getBlobClient(filePath);
      const exists = await blobClient.exists();
      this.logger.logDebug("AzureStorageService", `File existence check for ${filePath}: ${exists}`);
      return exists;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.logWarn("AzureStorageService", `Error checking file existence for ${filePath}: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Lists files under a directory prefix without forcing a trailing '/'.
   * @param directoryPath - Path prefix (e.g., 'Codes/processed_codes')
   * @returns Promise<string[]>
   */
  async listFiles(directoryPath: string): Promise<string[]> {
    try {
      const prefix = directoryPath; // Use as-is, no trailing slash added
      this.logger.logDebug("AzureStorageService", `Listing files with prefix: ${prefix}`);
      const files: string[] = [];

      for await (const blob of this.containerClient.listBlobsFlat({ prefix })) {
        if (blob.name && !blob.name.endsWith('/')) {
          files.push(blob.name);
        }
      }

      this.logger.logInfo("AzureStorageService", `Found ${files.length} files in ${directoryPath}`, { sampleFiles: files.slice(0, 5) });
      return files;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.logError("AzureStorageService", `Failed to list files in ${directoryPath}: ${errorMessage}`);
      throw new Error(`Failed to list files in ${directoryPath}: ${errorMessage}`);
    }
  }

  /**
   * Lists files by exact name prefix (e.g., 'Codes/processed_codes/J30')
   * @param prefixKey - Full key prefix without trailing slash
   * @returns Promise<string[]>
   */
  async listFilesByName(prefixKey: string): Promise<string[]> {
    try {
      this.logger.logDebug("AzureStorageService", `Listing files by name with prefix: ${prefixKey}`);
      const files: string[] = [];

      for await (const blob of this.containerClient.listBlobsFlat({ prefix: prefixKey })) {
        if (blob.name && !blob.name.endsWith('/')) {
          files.push(blob.name);
        }
      }

      this.logger.logInfo("AzureStorageService", `Found ${files.length} files matching ${prefixKey}`, { sampleFiles: files.slice(0, 5) });
      return files;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.logError("AzureStorageService", `Failed to list files by name for ${prefixKey}: ${errorMessage}`);
      throw new Error(`Failed to list files by name for ${prefixKey}: ${errorMessage}`);
    }
  }

  clearCache(): void {
    this.cache.clear();
    this.cacheHits = 0;
    this.cacheRequests = 0;
    this.logger.logInfo("AzureStorageService", "Cache cleared");
  }

  getCacheStats(): { size: number; hitRate: number } {
    const hitRate = this.cacheRequests > 0 ? (this.cacheHits / this.cacheRequests) * 100 : 0;
    return { size: this.cache.size, hitRate: Math.round(hitRate * 100) / 100 };
  }

  private getCachedContent(filePath: string): string | null {
    const entry = this.cache.get(filePath);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.CACHE_TTL_MS) {
      this.cache.delete(filePath);
      return null;
    }
    return entry.content;
  }

  private setCachedContent(filePath: string, content: string): void {
    this.cache.set(filePath, { content, timestamp: Date.now() });
    this.logger.logDebug("AzureStorageService", `Cached content for ${filePath}`);
  }

  private async streamToString(stream: NodeJS.ReadableStream): Promise<string> {
    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      stream.on('error', reject);
    });
  }
}
