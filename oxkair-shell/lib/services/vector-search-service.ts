/**
 * Vector Search Service - RAG-based CPT code extraction using Azure AI Search
 * 
 * This service provides vector database search functionality for CPT code extraction
 * using Azure OpenAI with Azure AI Search integration for RAG (Retrieval Augmented Generation).
 */

import { z } from "zod";
import { AIModelService } from './ai-model-service.ts';
import { WorkflowLogger } from '../../app/coder/lib/logging.ts';

// Vector search result schema for candidate codes (3-6 per procedure)
const VectorSearchResultSchema = z.object({
  procedures: z.array(z.object({
    id: z.string(),
    candidateCodes: z.array(z.string().regex(/^\d{5}$/)),
    addOn: z.boolean().default(false),
    linkedPrimaryId: z.string().nullable().default(null),
    evidence: z.string().min(1),
    rationale: z.string().min(1),
    details: z.string().min(1).default(""),
    keyFactors: z.array(z.string()).default([]),
    units: z.number().positive().int().default(1)
  })).min(1)
}).transform(data => ({
  procedures: data.procedures.map(proc => ({
    ...proc,
    // Ensure details has a value, use rationale as fallback
    details: proc.details || proc.rationale || `Procedure with candidates: ${proc.candidateCodes.join(', ')}`,
    // Ensure keyFactors is an array
    keyFactors: Array.isArray(proc.keyFactors) ? proc.keyFactors : [],
    // Ensure units is a valid positive integer
    units: proc.units && proc.units > 0 ? proc.units : 1
  }))
}));

export type VectorSearchResult = z.infer<typeof VectorSearchResultSchema>;

// ICD vector search result schema
const IcdVectorSearchResultSchema = z.object({
  diagnoses: z.array(z.object({
    id: z.string(),
    icdCode: z.string().regex(/^[A-Z]\d{2}(\.\d{1,3})?$/),
    linkedCptCode: z.string().min(1),
    evidence: z.string().min(1),
    rationale: z.string().min(1),
    details: z.string().min(1).default(""),
    keyFactors: z.array(z.string()).default([]),
    confidence: z.enum(["high", "medium", "low"]).default("medium")
  })).min(1)
}).transform(data => ({
  diagnoses: data.diagnoses.map(diag => ({
    ...diag,
    // Ensure details has a value, use rationale as fallback
    details: diag.details || diag.rationale || `Diagnosis: ${diag.icdCode}`,
    // Ensure keyFactors is an array
    keyFactors: Array.isArray(diag.keyFactors) ? diag.keyFactors : []
  }))
}));

export type IcdVectorSearchResult = z.infer<typeof IcdVectorSearchResultSchema>;

export interface VectorSearchConfig {
  searchEndpoint: string;
  searchKey: string;
  searchIndex: string;
  embeddingsDeployment: string;
  chatDeployment: string;
  azureOpenAIEndpoint: string;
  azureOpenAIApiKey: string;
  apiVersion: string;
}

export interface VectorSearchService {
  /**
   * Performs RAG-based CPT code extraction using vector database search
   * @param operativeNote The operative note text to analyze
   * @returns Structured CPT procedure extraction results
   */
  extractProceduresWithRAG(operativeNote: string): Promise<VectorSearchResult>;

  /**
   * Performs RAG-based CPT code extraction with fallback retry logic
   * @param operativeNote The operative note text to analyze
   * @returns Structured CPT procedure extraction results
   */
  extractProceduresWithRAGWithFallback(operativeNote: string): Promise<VectorSearchResult>;

  /**
   * Performs RAG-based ICD-10 diagnosis code extraction using vector database search
   * @param operativeNote The operative note text to analyze
   * @param cptCodes The CPT codes that need ICD linkage for medical necessity
   * @returns Structured ICD diagnosis extraction results
   */
  extractDiagnosesWithRAG(operativeNote: string, cptCodes: any[]): Promise<IcdVectorSearchResult>;

  /**
   * Performs RAG-based ICD-10 diagnosis code extraction with fallback retry logic
   * @param operativeNote The operative note text to analyze
   * @param cptCodes The CPT codes that need ICD linkage for medical necessity
   * @returns Structured ICD diagnosis extraction results
   */
  extractDiagnosesWithRAGWithFallback(operativeNote: string, cptCodes: any[]): Promise<IcdVectorSearchResult>;
}

export class AzureVectorSearchService implements VectorSearchService {
  private config: VectorSearchConfig;
  private aiModelService: AIModelService | null = null;
  private logger?: WorkflowLogger;

  constructor(config: VectorSearchConfig, logger?: WorkflowLogger) {
    this.config = config;
    this.logger = logger;
    // Don't initialize AI model service immediately to avoid backend config requirements
  }

  /**
   * Lazy initialization of AI model service
   */
  private getAIModelService(): AIModelService {
    if (!this.aiModelService) {
      this.aiModelService = new AIModelService({
        provider: 'azure',
        model: this.config.chatDeployment,
        temperature: 0.1,
        maxTokens: 2048,
        timeout: 60000
      }, this.logger, 'vector_search_service');
    }
    return this.aiModelService;
  }

  /**
   * Makes a vector search request using the AI model service with backend assignment
   */
  async makeVectorSearchRequest(
    systemPrompt: string,
    userContent: string,
    searchIndex: string,
    embeddingsDeployment: string,
    vectorFields: string[] = ["text_vector"],
    contentFields: string[] = ["chunk"],
    titleField: string = "title",
    filepathField?: string
  ): Promise<string> {
    // Create the data sources configuration for vector search
    const dataSources = [{
      type: "azure_search",
      parameters: {
        endpoint: this.config.searchEndpoint,
        index_name: searchIndex,
        query_type: "simple",
        embedding_dependency: {
          type: "deployment_name",
          deployment_name: embeddingsDeployment
        },
        fields_mapping: {
          content_fields: contentFields,
          vector_fields: vectorFields,
          title_field: titleField,
          ...(filepathField && { filepath_field: filepathField })
        },
        in_scope: true,
        strictness: 3,
        top_n_documents: 10,
        authentication: {
          type: "api_key",
          key: this.config.searchKey
        }
      }
    }];

    // Use AI model service's custom request method for vector search
    return await this.makeCustomVectorRequest(systemPrompt, userContent, dataSources);
  }

  /**
   * Makes a vector search request using mini model variant
   */
  private async makeVectorSearchRequestWithMini(
    systemPrompt: string,
    userContent: string,
    searchIndex: string,
    embeddingsDeployment: string,
    vectorFields: string[] = ["text_vector"],
    contentFields: string[] = ["chunk"],
    titleField: string = "title",
    filepathField?: string
  ): Promise<string> {
    // Create the data sources configuration for vector search
    const dataSources = [{
      type: "azure_search",
      parameters: {
        endpoint: this.config.searchEndpoint,
        index_name: searchIndex,
        query_type: "simple",
        embedding_dependency: {
          type: "deployment_name",
          deployment_name: embeddingsDeployment
        },
        fields_mapping: {
          content_fields: contentFields,
          vector_fields: vectorFields,
          title_field: titleField,
          ...(filepathField && { filepath_field: filepathField })
        },
        in_scope: true,
        strictness: 3,
        top_n_documents: 10,
        authentication: {
          type: "api_key",
          key: this.config.searchKey
        }
      }
    }];

    // Use AI model service's custom request method for vector search with mini model
    return await this.makeCustomVectorRequestWithMini(systemPrompt, userContent, dataSources);
  }

  /**
   * Makes a custom vector search request with data sources
   */
  private async makeCustomVectorRequest(
    systemPrompt: string,
    userContent: string,
    dataSources: any[]
  ): Promise<string> {
    // We need to use a custom method since the AI model service doesn't support data_sources
    // This method will use the backend manager for endpoint assignment and failover
    const aiModelService = this.getAIModelService();
    const backendInfo = (aiModelService as any).getAzureClient();
    
    const requestBody = {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ],
      temperature: 0.1,
      max_tokens: 2048,
      data_sources: dataSources
    };

    try {
      const response = await fetch(
        `${backendInfo.endpointUrl}/openai/deployments/${backendInfo.deployment}/chat/completions?api-version=${this.config.apiVersion}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': process.env.AZURE_OPENAI_API_KEY || '',
          },
          body: JSON.stringify(requestBody)
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        
        // Handle 429 errors with backend manager
        if (response.status === 429) {
          (aiModelService as any).backendManager.recordFailure('vector_search_service', { status: 429, message: errorText });
          
          // Try with fallback backend
          const fallbackBackend = (aiModelService as any).getAzureClient();
          if (fallbackBackend.endpoint !== backendInfo.endpoint) {
            const fallbackResponse = await fetch(
              `${fallbackBackend.endpointUrl}/openai/deployments/${fallbackBackend.deployment}/chat/completions?api-version=${this.config.apiVersion}`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'api-key': process.env.AZURE_OPENAI_API_KEY || '',
                },
                body: JSON.stringify({
                  ...requestBody,
                  // Update deployment in request body for fallback
                  // Note: data_sources config remains the same as it's search-specific
                })
              }
            );
            
            if (fallbackResponse.ok) {
              (aiModelService as any).backendManager.recordSuccess('vector_search_service', fallbackBackend.endpoint);
              const fallbackData = await fallbackResponse.json();
              return fallbackData.choices?.[0]?.message?.content || '';
            }
          }
        }
        
        // Record failure for other errors
        (aiModelService as any).backendManager.recordFailure('vector_search_service', { status: response.status, message: errorText });
        throw new Error(`Azure OpenAI API call failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      // Record success
      (aiModelService as any).backendManager.recordSuccess('vector_search_service', backendInfo.endpoint);
      
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('No content returned from Azure OpenAI API');
      }

      return content;
    } catch (error) {
      // Record failure for network/other errors
      (aiModelService as any).backendManager.recordFailure('vector_search_service', error);
      throw error;
    }
  }

  /**
   * Makes a custom vector search request with data sources using mini model
   */
  private async makeCustomVectorRequestWithMini(
    systemPrompt: string,
    userContent: string,
    dataSources: any[]
  ): Promise<string> {
    // We need to use a custom method since the AI model service doesn't support data_sources
    // This method will use the backend manager for endpoint assignment and failover with mini model
    const aiModelService = this.getAIModelService();
    const backendInfo = (aiModelService as any).getAzureClient();
    
    // Modify deployment name to use mini variant
    const miniDeployment = backendInfo.deployment.includes('-mini') ? backendInfo.deployment : `${backendInfo.deployment}-mini`;
    
    const requestBody = {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ],
      temperature: 0.1,
      max_tokens: 2048,
      data_sources: dataSources
    };

    try {
      const response = await fetch(
        `${backendInfo.endpointUrl}/openai/deployments/${miniDeployment}/chat/completions?api-version=${this.config.apiVersion}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': process.env.AZURE_OPENAI_API_KEY || '',
          },
          body: JSON.stringify(requestBody)
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        
        // Record failure for mini model
        (aiModelService as any).backendManager.recordFailure('vector_search_service_mini', { status: response.status, message: errorText });
        throw new Error(`Azure OpenAI API call failed (mini model): ${response.status} ${response.statusText} - ${errorText}`);
      }

      // Record success for mini model
      (aiModelService as any).backendManager.recordSuccess('vector_search_service_mini', backendInfo.endpoint);
      
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('No content returned from Azure OpenAI API (mini model)');
      }

      return content;
    } catch (error) {
      // Record failure for network/other errors
      (aiModelService as any).backendManager.recordFailure('vector_search_service_mini', error);
      throw error;
    }
  }

  /**
   * Extracts procedures with fallback retry logic for zero results and rate limits
   */
  async extractProceduresWithRAGWithFallback(operativeNote: string): Promise<VectorSearchResult> {
    try {
      // First attempt with regular model
      const result = await this.extractProceduresWithRAG(operativeNote);
      
      // Check if we got any procedures
      if (result.procedures && result.procedures.length > 0) {
        return result;
      }
      
      // No procedures found, try again with same model
      console.warn('[VectorSearchService] No procedures found on first attempt, retrying...');
      const retryResult = await this.extractProceduresWithRAG(operativeNote);
      
      if (retryResult.procedures && retryResult.procedures.length > 0) {
        return retryResult;
      }
      
      // Still no procedures, try with mini model
      console.warn('[VectorSearchService] No procedures found on retry, attempting with mini model...');
      const miniResult = await this.extractProceduresWithRAGMini(operativeNote);
      
      return miniResult;
      
    } catch (error: any) {
      // If we get a 429 error, try with mini model
      if (error.message?.includes('429') || error.status === 429) {
        console.warn('[VectorSearchService] Rate limit hit, falling back to mini model...');
        try {
          return await this.extractProceduresWithRAGMini(operativeNote);
        } catch (miniError) {
          console.error('[VectorSearchService] Mini model also failed:', miniError);
          throw error; // Throw original error
        }
      }
      throw error;
    }
  }

  /**
   * Extracts procedures using mini model variant
   */
  private async extractProceduresWithRAGMini(operativeNote: string): Promise<VectorSearchResult> {
    const systemPrompt = `You are an expert, certified medical coder. Read one operative (surgical) note and return ONLY a strict JSON object with a "procedures" array. Each array element represents one distinct procedure with 3-6 candidate CPT codes that could potentially apply.

AUTHORITY & GROUND TRUTH (non-negotiable)
- Use the RAG system ("updated-cpt" index) as the single source of truth for code existence, official descriptions, and the provided "common language" descriptions.
- Do not invent or output real CPT numbers that don't exist in the vector database output.

UNIQUENESS & SCOPE
- Each returned procedure must represent a distinct billable procedure element.
- For each distinct procedure, provide 3-6 candidate CPT codes that could potentially apply.
- Return at least one procedure when any separately billable service is documented.

EXTRACTION FLOW (keep it simple and evidence-driven)
1) Normalize headings (case-insensitive): OPERATION/PROCEDURE(S)/SURGICAL PROCEDURE/PROCEDURES PERFORMED; DETAILS OF PROCEDURE/TECHNIQUE/DESCRIPTION OF PROCEDURE; ANESTHESIA/ANESTHESIA TYPE.
2) Break the note into discrete actions:
   - Treat each bullet, sentence describing an independent therapeutic or diagnostic action, or discrete anatomic site action as a candidate procedure.
   - Examples of discrete actions: "excision of lesion on right forearm," "diagnostic laparoscopy," "open reduction internal fixation of right distal radius," "cystoscopy with ureteral stent placement."
3) For each candidate procedure, extract and normalize these attributes (use them to choose the single best CPT):
   - Anatomy/site (precise as possible: e.g., "right distal radius", "left lower lobe lung", "midline abdominal wall").
   - Procedure intent/operation type (excision, excisional biopsy, incision and drainage, repair, reconstruction, debridement, graft, implant removal, exploration).
   - Approach/technology (open, laparoscopic, endoscopic, percutaneous, robotic, transvaginal, perineal).
   - Depth/extent/size/levels (cm, number of levels, number of lesions, area in cm², or descriptive size).
   - Key qualifiers: implant/mesh use, infected/non-infected, incarcerated/strangulated, primary vs recurrent, emergent/trauma, staged procedure, multi-stage reconstruction, simultaneous procedures at different sites.
   - Laterality (Left/Right/Bilateral/Not specified).
   - Any intraoperative adjuncts (e.g., fluoroscopy, endoscopy performed as separate service vs bundled).
4) Choose the single best CPT per action: prefer the most specific code matching anatomy + intent + approach + documented complexity. Use add-on codes only when their required primary is present. Apply AMA/NCCI bundling—report separately only when truly distinct per policy and documentation.
  - If multiple separate anatomic sites or distinct operations are performed, they should become separate procedure entries (if CPTs exist in RAG and are separately billable).
   - Apply AMA bundling/global package rules: if something is typically bundled (e.g., intraoperative endoscopy) only extract it as separate if documentation shows a distinct, separately reportable service per CPT guidance in RAG.
   - Do a two-pass selection: first pass pick stand-alone primary procedures, second pass add add-on codes (only if their required primary is present and both exist in RAG).
5) Unit considerations: bilateral procedures (may warrant 2 units), multiple identical procedures at different sites, time-based procedures with documented duration.

DECISION REMINDERS
- Debridement: code by deepest tissue documented (skin/subQ vs muscle/fascia vs bone).
- Excision vs biopsy: whole lesion removed → excision by site/size; sampling → biopsy.
- Endoscopy: diagnostic endoscopy is bundled with therapeutic endoscopy unless clearly separate per NCCI.
- Revision/recurrent vs primary: select the code that matches explicit documentation.
- Inherent steps of a primary procedure are not separately reportable.

EVIDENCE & RATIONALE
- Evidence: Provide relevant verbatim excerpts (1-3 sentences) that prove the selection (anatomy/technique/size/levels/device/timing). Use exact quotes from the note; separate exact quotes with ';'.
- Rationale: Use 1-2 concise sentences on why the chosen code is best vs alternatives, paraphrasing NCCI bundling/exclusions where applicable and tying to the operative note. If using an unlisted code, explain why no specific code applies.

REQUIRED JSON SCHEMA - ALL FIELDS MANDATORY:
{
  "procedures": [
    {
      "id": "P1",                    // Required: Unique identifier (P1, P2, etc.)
      "candidateCodes": ["49000", "49002", "49010"],  // Required: 3-6 candidate CPT codes from RAG
      "addOn": false,                // Required: true for add-on codes, false for primary
      "linkedPrimaryId": null,       // Required: null for primary, "P1" etc for add-ons
      "evidence": "...",             // Required: Verbatim text from operative note (clean text, no escape characters)
      "rationale": "...",            // Required: Detailed explanation of why these candidate codes were selected
      "details": "...",              // Required: Procedure summary
      "keyFactors": ["..."],         // Required: Array of key clinical factors
      "units": 1                     // Required: Number of units (default 1, adjust based on documentation)
    }
  ]
}

CRITICAL FORMATTING REQUIREMENTS
- Return ONLY the JSON structure described above — no extra prose — valid JSON only wiht proper string values and escaping.
- ALL fields (id, cptCode, addOn, linkedPrimaryId, evidence, rationale, details, keyFactors, units) are REQUIRED.
- If an add-on is included, its linkedPrimaryId must reference an included primary procedure id, and both must exist in the 'updated-cpt' RAG.
- Provide at least one procedure in the output.

Operative Note:`;

    try {
      // Use mini model by modifying the deployment name
      const content = await this.makeVectorSearchRequestWithMini(
        systemPrompt,
        operativeNote,
        this.config.searchIndex,
        this.config.embeddingsDeployment,
        ["text_vector"],
        ["procedure_details_text", "common_language_description", "chunk"],
        "code_title",
        "parent_id"
      );

      if (!content) {
        throw new Error('No content returned from Azure OpenAI API (mini model)');
      }

      // Parse and validate the JSON response
      let parsedResult;
      try {
        // Handle markdown code blocks if present
        let jsonContent = content.trim();
        
        // Check for markdown code blocks and extract JSON
        if (jsonContent.startsWith('```json')) {
          // Remove ```json from start and ``` from end
          jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
        } else if (jsonContent.startsWith('```')) {
          // Remove ``` from start and end for generic code blocks
          jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
        }
        
        // Additional cleanup: remove any remaining backticks at start/end
        jsonContent = jsonContent.replace(/^`+/, '').replace(/`+$/, '').trim();
        
        parsedResult = JSON.parse(jsonContent);
      } catch (parseError) {
        throw new Error(`Failed to parse JSON response (mini model): ${parseError instanceof Error ? parseError.message : 'Unknown error'}. Content: ${content.substring(0, 200)}...`);
      }

      // Validate against schema
      const validatedResult = VectorSearchResultSchema.parse(parsedResult);
      return validatedResult;

    } catch (error) {
      throw new Error(`Vector search extraction failed (mini model): ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async extractProceduresWithRAG(operativeNote: string): Promise<VectorSearchResult> {
    const systemPrompt = `You are an expert medical coding agent. For each provided operative note, do one thing: extract a single structured procedure object with key attributes, and CPT code candidates.

SOURCES (non-negotiable)
- Use the “updated-cpt” RAG index as the single source of truth for CPT codes and official descriptions. Do not invent codes.

UNIQUENESS & SCOPE 
- Each returned procedure must represent a distinct billable procedure element. 
- For each distinct procedure, provide 3-5 candidate CPT codes that could potentially apply. 
- Return at least one procedure when any separately billable service is documented. 

EXTRACTION FLOW (keep it simple and evidence-driven) 
1) Normalize headings (case-insensitive): OPERATION/PROCEDURE(S)/SURGICAL PROCEDURE/PROCEDURES PERFORMED; DETAILS OF PROCEDURE/TECHNIQUE/DESCRIPTION OF PROCEDURE; ANESTHESIA/ANESTHESIA TYPE. 
2) Break the note into discrete actions: 
- Treat each bullet, sentence describing an independent therapeutic or diagnostic action, or discrete anatomic site action as a candidate procedure.
- Do a two-pass selection: first pass pick stand-alone primary procedures, second pass add add-on codes (only if their required primary is present and both exist in RAG).
- Ensure that all distinct executed procedure is listed and used for analysis.

For each procedure, identify and extract the following:
   - procedure_index (int)
   - approach ("open"|"laparoscopic"|"robotic"|null)
   - anatomy (array of strings; e.g., ["ventral","suprapubic","parastomal"])
   - laterality ("left"|"right"|"bilateral"|null)
   - recurrence (true|false|"unknown")
   - incarcerated (true|false|"unknown")
   - obstruction (true|false|"unknown")
   - gangrene (true|false|"unknown")
   - mesh_placed (true|false|"unknown")
   - defect_size_cm {length:number, width:number, source_text:string}|null
   - concurrent_procedures (array of strings)
   - assistant_role {type:"resident"|"physician"|"PA"|"none", billable:true|false}
   - surgeon_confirmations_needed (array of strings)
   - evidence_snippets (array of verbatim text lines supporting fields)

2. Use the structured fields (not raw full text) to query the CPT RAG in this order:
   a. Filter active codes by anatomy and approach.
   b. Filter/boost by recurrence (recurrent vs initial).
   c. Filter/boost by incarceration/obstruction/gangrene flags.
   d. Filter/boost by numeric defect size (use max(length,width)); if size maps into a code bracket, prefer those codes.
   e. Use mesh_placed to prefer or deprioritize mesh-specific/bundled codes.
   f. Apply active_flag and exclude retired/superseded CPTs.

Return top 3-5 candidates, short rationale, and evidence snippet(s).

OUTPUT (ONLY VALID JSON — no extra text)
Return a single JSON object matching the schema below. All fields are mandatory; use null or empty arrays where appropriate. Use the exact field names shown.

REQUIRED JSON SCHEMA - ALL FIELDS MANDATORY:
{
  "procedures": [
    {
      "id": "P1",                    // Required: Unique identifier (P1, P2, etc.)
      "candidateCodes": ["49000", "49002", "49010"],  // Required: 3-6 candidate CPT codes from RAG
      "addOn": false,                // Required: true for add-on codes, false for primary
      "linkedPrimaryId": null,       // Required: null for primary, "P1" etc for add-ons
      "evidence": "...",             // Required: Verbatim text from operative note (clean text, no escape characters)
      "rationale": "...",            // Required: Detailed explanation of why these candidate codes were selected
      "details": "...",              // Required: Procedure summary
      "keyFactors": ["..."],         // Required: Array of key clinical factors
      "units": 1                     // Required: Number of units (default 1, adjust based on documentation)
    },
    {
      "id": "P2",                    
      "candidateCodes": ["..."], 
      "addOn": false,               
      "linkedPrimaryId": null,    
      "evidence": "...",             
      "rationale": "...",           
      "details": "...",        
      "keyFactors": ["..."],        
      "units": 1                   
    },
    ...
  ]
}

CRITICAL FORMATTING REQUIREMENTS
- Return ONLY the JSON structure described above — no extra prose — valid JSON only wiht proper string values and escaping.
- ALL fields (id, cptCode, addOn, linkedPrimaryId, evidence, rationale, details, keyFactors, units) are REQUIRED.
- If an add-on is included, its linkedPrimaryId must reference an included primary procedure id, and both must exist in the 'updated-cpt' RAG.
- Provide at least one procedure in the output.

Operative Note:`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: operativeNote }
    ];

    try {
      // Use the new vector search method with backend assignment
      const content = await this.makeVectorSearchRequest(
        systemPrompt,
        operativeNote,
        this.config.searchIndex,
        this.config.embeddingsDeployment,
        ["text_vector"],
        ["procedure_details_text", "common_language_description", "chunk"],
        "code_title",
        "parent_id"
      );

      if (!content) {
        throw new Error('No content returned from Azure OpenAI API');
      }

      // Parse and validate the JSON response
      let parsedResult;
      try {
        // Handle markdown code blocks if present
        let jsonContent = content.trim();
        
        // Check for markdown code blocks and extract JSON
        if (jsonContent.startsWith('```json')) {
          // Remove ```json from start and ``` from end
          jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
        } else if (jsonContent.startsWith('```')) {
          // Remove ``` from start and end for generic code blocks
          jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
        }
        
        // Additional cleanup: remove any remaining backticks at start/end
        jsonContent = jsonContent.replace(/^`+/, '').replace(/`+$/, '').trim();
        
        parsedResult = JSON.parse(jsonContent);
      } catch (parseError) {
        throw new Error(`Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}. Content: ${content.substring(0, 200)}...`);
      }

      // Validate against schema
      const validatedResult = VectorSearchResultSchema.parse(parsedResult);
      return validatedResult;

    } catch (error) {
      throw new Error(`Vector search extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async extractDiagnosesWithRAG(operativeNote: string, cptCodes: any[]): Promise<IcdVectorSearchResult> {
    const cptCodesFormatted = cptCodes.map(cpt => 
      `- ${cpt.code}: ${cpt.description}`
    ).join('\n');

    const systemPrompt = `You are an expert, certified medical coder specializing in ICD-10-CM diagnosis coding. Your task is to identify and select the most appropriate ICD-10 diagnosis codes that establish medical necessity for each of the provided CPT procedure codes.

AUTHORITY & GROUND TRUTH (non-negotiable)
- Use the RAG system ("icd" index) as the single source of truth for ICD-10 code existence, official descriptions, and inclusion terms.
- Do not invent or output ICD-10 codes that don't exist in the vector database output.

COMPREHENSIVE ICD EXTRACTION LOGIC (merged from prefix identification and selection)
1) For each CPT code, identify relevant diagnoses that establish medical necessity:
   - Primary diagnoses that directly justify the procedure
   - Secondary diagnoses that affect procedural complexity or approach
   - Comorbidities that impact medical decision-making
   - Anatomical variants or complications documented

2) Extract and normalize diagnostic attributes from the clinical documentation:
   - Anatomical location (precise as possible: e.g., "right lower extremity", "ascending colon")
   - Pathology type (acute vs chronic, primary vs secondary, benign vs malignant)
   - Severity indicators (mild, moderate, severe, complicated, uncomplicated)
   - Temporal aspects (acute, chronic, recurrent, history of)
   - Laterality (Left/Right/Bilateral/Unspecified)
   - Specificity qualifiers (with/without complications, obstructed/non-obstructed, incarcerated/reducible)

3) Medical necessity decision rules:
   - Prefer the most specific ICD-10 code that matches the documented clinical findings
   - Ensure each selected diagnosis directly supports the medical necessity of its linked CPT code
   - Include relevant comorbidities that affect surgical risk or complexity
   - Apply ICD-10-CM coding guidelines for combination codes, manifestation codes, and sequencing

4) Evidence-based selection criteria:
   - Use verbatim documentation from the operative note as evidence
   - Provide clear rationale linking each diagnosis to its corresponding procedure (paraphrase why this code is ideal, don't say "RAG")
   - Include key clinical factors that support the diagnostic selection

CPT CODES REQUIRING ICD LINKAGE:
${cptCodesFormatted}

REQUIRED JSON SCHEMA - ALL FIELDS MANDATORY:
{
  "diagnoses": [
    {
      "id": "D1",                           // Required: Unique identifier (D1, D2, etc.)
      "icdCode": "K80.20",                  // Required: ICD-10-CM code from RAG
      "linkedCptCode": "47562",             // Required: CPT code this diagnosis supports
      "evidence": "...",                    // Required: Verbatim text from operative note
      "rationale": "...",                   // Required: Medical necessity explanation
      "details": "...",                     // Required: Diagnosis description/summary
      "keyFactors": ["..."],                // Required: Array of key clinical factors
    }
  ]
}

CRITICAL FORMATTING REQUIREMENTS
- The agent MUST return ONLY the JSON object described above — no extra prose — valid JSON only with proper string values.
- ALL fields (id, icdCode, linkedCptCode, evidence, rationale, details, keyFactors, confidence) are REQUIRED.
- Each diagnosis must come from the "icd" RAG index and be linked to exactly one CPT code from the provided list.
- Provide at least one diagnosis in the output. 
- Focus on diagnoses that establish clear medical necessity for the procedures.

Operative Note:`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: operativeNote }
    ];

    try {
      const requestBody = {
        messages,
        data_sources: [{
          type: "azure_search",
          parameters: {
            endpoint: this.config.searchEndpoint,
            index_name: "icd", // Use the ICD index
            query_type: "simple",
            embedding_dependency: {
              type: "deployment_name",
              deployment_name: this.config.embeddingsDeployment
            },
            fields_mapping: {
              // What the model should read
              content_fields: [
                "chunk",           // main text
                "inclusionTerms",  // extra synonyms/terms
                "code"             // short code string; still useful context
              ],
              // Vector field used for ANN search
              vector_fields: ["text_vector"],
              // Field to show as the title in citations
              title_field: "code",
              // Optional: parent/document id
              filepath_field: "parent_id"
            },
            in_scope: true,
            strictness: 3,
            top_n_documents: 10,
            authentication: {
              type: "api_key",
              key: this.config.searchKey
            }
          }
        }]
      };

      // Use the new vector search method with backend assignment
      const content = await this.makeVectorSearchRequest(
        systemPrompt,
        operativeNote,
        "icd",
        this.config.embeddingsDeployment,
        ["text_vector"],
        ["chunk"],
        "code",
        "parent_id"
      );

      if (!content) {
        throw new Error('No content returned from Azure OpenAI API');
      }

      // Parse and validate the JSON response
      let parsedResult;
      try {
        // Handle markdown code blocks if present
        let jsonContent = content.trim();
        
        // Check for markdown code blocks and extract JSON
        if (jsonContent.startsWith('```json')) {
          // Remove ```json from start and ``` from end
          jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
        } else if (jsonContent.startsWith('```')) {
          // Remove ``` from start and end for generic code blocks
          jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
        }
        
        // Additional cleanup: remove any remaining backticks at start/end
        jsonContent = jsonContent.replace(/^`+/, '').replace(/`+$/, '').trim();
        
        parsedResult = JSON.parse(jsonContent);
      } catch (parseError) {
        throw new Error(`Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}. Content: ${content.substring(0, 200)}...`);
      }

      // Validate against schema
      const validatedResult = IcdVectorSearchResultSchema.parse(parsedResult);
      return validatedResult;

    } catch (error) {
      throw new Error(`ICD vector search extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extracts diagnoses with fallback retry logic for zero results and rate limits
   */
  async extractDiagnosesWithRAGWithFallback(operativeNote: string, cptCodes: any[]): Promise<IcdVectorSearchResult> {
    try {
      
      // First attempt with regular model
      const result = await this.extractDiagnosesWithRAGMini(operativeNote, cptCodes);
      
      // Check if we got any diagnoses
      if (result.diagnoses && result.diagnoses.length > 0) {
        return result;
      }
      
      // No diagnoses found, try again with same model
      console.warn('[VectorSearchService] No diagnoses found on first attempt, retrying...');
      const retryResult = await this.extractDiagnosesWithRAG(operativeNote, cptCodes);
      
      if (retryResult.diagnoses && retryResult.diagnoses.length > 0) {
        return retryResult;
      }
      
      // Still no diagnoses, try with mini model
      console.warn('[VectorSearchService] No diagnoses found on retry, attempting with mini model...');
      const miniResult = await this.extractDiagnosesWithRAGMini(operativeNote, cptCodes);
      
      return miniResult;
      
    } catch (error: any) {
      // If we get a 429 error, try with mini model
      if (error.message?.includes('429') || error.status === 429) {
        console.warn('[VectorSearchService] Rate limit hit, falling back to mini model...');
        try {
          return await this.extractDiagnosesWithRAGMini(operativeNote, cptCodes);
        } catch (miniError) {
          console.error('[VectorSearchService] Mini model also failed:', miniError);
          throw error; // Throw original error
        }
      }
      throw error;
    }
  }

  /**
   * Extracts diagnoses using mini model variant
   */
  private async extractDiagnosesWithRAGMini(operativeNote: string, cptCodes: any[]): Promise<IcdVectorSearchResult> {
    const cptCodesFormatted = cptCodes.map(cpt => 
      `- ${cpt.code}: ${cpt.description}`
    ).join('\n');

    const systemPrompt = `You are an expert medical coding agent. For each provided operative note, do two things: (A) extract a single structured procedure object with key attributes, and (B) return candidate CPT codes (top 3) plus ICD-10 diagnosis(s) from the "icd" RAG that establish medical necessity.

SOURCES (non-negotiable)
- Use the "icd" RAG index as the single source of truth for ICD-10 codes and official descriptions.
- Use the CPT catalog/database available to you as the single source of truth for CPT codes. Do not invent codes.

EXTRACTION LOGIC (structured-first)
1. Extract these procedure attributes from the note and normalize them:
   - procedure_index (int)
   - approach ("open"|"laparoscopic"|"robotic"|null)
   - anatomy (array of strings; e.g., ["ventral","suprapubic","parastomal"])
   - laterality ("left"|"right"|"bilateral"|null)
   - recurrence (true|false|"unknown")
   - incarcerated (true|false|"unknown")
   - obstruction (true|false|"unknown")
   - gangrene (true|false|"unknown")
   - mesh_placed (true|false|"unknown")
   - defect_size_cm {length:number, width:number, source_text:string}|null
   - concurrent_procedures (array of strings)
   - assistant_role {type:"resident"|"physician"|"PA"|"none", billable:true|false}
   - surgeon_confirmations_needed (array of strings)
   - evidence_snippets (array of verbatim text lines supporting fields)

2. Use those structured fields (not raw full-text) to search the CPT catalog:
   - Filter active codes by anatomy, approach, recurrence, incarceration, mesh, and numeric size where available.
   - Score candidates using anatomy match, size match, approach, incarceration, recurrence, and mesh.
   - Return the top 3 candidate CPTs with short rationale and the evidence snippet used.

3. For each recommended diagnosis, query the "icd" RAG and return exact ICD-10 codes and descriptions that match the extracted facts (use most-specific code that fits documentation). Do not invent codes—only return codes present in "icd".

AMBIGUITY / BOUNDARIES
- If a numeric size equals a code boundary (e.g., exactly 3.0 cm), 
- If required fields (mesh_placed, defect_size_cm, obstruction) are "unknown".

OUTPUT (ONLY VALID JSON — no extra text)
Return a single JSON object exactly matching this schema (all fields required; use null or empty arrays where appropriate):

{
  "procedure": {
    "procedure_index": 1,
    "approach": "open",
    "anatomy": ["ventral","suprapubic"],
    "laterality": null,
    "recurrence": false,
    "incarcerated": true,
    "obstruction": "unknown",
    "gangrene": false,
    "mesh_placed": false,
    "defect_size_cm": {"length":2,"width":3,"source_text":"2 x 3 cm"},
    "concurrent_procedures": ["cystectomy","ileal conduit creation"],
    "assistant_role": {"type":"resident","billable":false},
    "surgeon_confirmations_needed": ["mesh_placement","exact_defect_size"],
    "evidence_snippets": ["..."]
  },
  "cpt_candidates": [
    {
      "code": "49592",
      "description": "short text",
      "score": 85,
      "evidence_snippet": "operative note line used",
      "rationale": "brief rule-based reason why this fits"
    }
  ],
  "recommended_cpt": {
    "code": "49592",
    "description": "short text",
    "confidence": "high",
    "rationale": "one-sentence justification"
  },
  "diagnoses": [
    {
      "id": "D1",
      "icdCode": "K43.9",
      "description": "Ventral hernia without obstruction or gangrene",
      "linkedCptCode": "49592",
      "evidence": "operative note verbatim supporting diagnosis",
      "rationale": "why this ICD establishes medical necessity",
      "keyFactors": ["incarcerated","ventral","2 x 3 cm"],
      "confidence": "high"
    }
  ],
  "human_review": false
}

ADDITIONAL RULES
- Always prefer structured-field matching over free-text matches.
- Return exactly three top CPT candidates when possible (if less available, return as many as match).
- Do not output ICD-10 codes not present in the "icd" RAG.
- Output JSON only; nothing else.

operative note:
`;

    try {
      // Use mini model by using the mini variant method
      const content = await this.makeVectorSearchRequestWithMini(
        systemPrompt,
        operativeNote,
        "icd",
        this.config.embeddingsDeployment,
        ["text_vector"],
        ["chunk"],
        "code",
        "parent_id"
      );

      if (!content) {
        throw new Error('No content returned from Azure OpenAI API (mini model)');
      }

      // Parse and validate the JSON response
      let parsedResult;
      try {
        // Handle markdown code blocks if present
        let jsonContent = content.trim();
        
        // Check for markdown code blocks and extract JSON
        if (jsonContent.startsWith('```json')) {
          // Remove ```json from start and ``` from end
          jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
        } else if (jsonContent.startsWith('```')) {
          // Remove ``` from start and end for generic code blocks
          jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
        }
        
        // Additional cleanup: remove any remaining backticks at start/end
        jsonContent = jsonContent.replace(/^`+/, '').replace(/`+$/, '').trim();
        
        parsedResult = JSON.parse(jsonContent);
      } catch (parseError) {
        throw new Error(`Failed to parse JSON response (mini model): ${parseError instanceof Error ? parseError.message : 'Unknown error'}. Content: ${content.substring(0, 200)}...`);
      }

      // Validate against schema
      const validatedResult = IcdVectorSearchResultSchema.parse(parsedResult);
      return validatedResult;

    } catch (error) {
      throw new Error(`ICD vector search extraction failed (mini model): ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}