#!/usr/bin/env tsx

/**
 * CPT Agent UpdatedCPT Integration Test and Demonstration
 * 
 * This script demonstrates how the CPT Agent should be modified to use the UpdatedCPT folder
 * and provides comprehensive testing of the integration.
 */

import { AzureStorageServiceImpl } from '../lib/services/azure-storage-service.ts';
import { WorkflowLogger } from '../app/coder/lib/logging.ts';
import { createDefaultAIModelService } from '../lib/services/ai-model-service.ts';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

interface CptCodeData {
  code: string;
  title: string;
  summary: string;
  globalDays?: string;
  mueLimit?: number;
  allowed_modifiers?: string[];
  allowed_icd_families?: string[];
  source: 'UpdatedCPT' | 'CPT';
}

class EnhancedCPTDataService {
  constructor(
    private azureService: AzureStorageServiceImpl,
    private logger: WorkflowLogger
  ) {}

  /**
   * Enhanced CPT data retrieval that prioritizes UpdatedCPT over standard CPT
   * This is the pattern the CPT Agent should implement
   */
  async getCptCodeData(code: string): Promise<CptCodeData | null> {
    try {
      // Step 1: Try UpdatedCPT first (preferred)
      const updatedPath = `UpdatedCPT/${code}.json`;
      const updatedExists = await this.azureService.fileExists(updatedPath);
      
      if (updatedExists) {
        const content = await this.azureService.getFileContent(updatedPath);
        const data = JSON.parse(content);
        
        this.logger.logInfo('EnhancedCPTDataService', `Retrieved ${code} from UpdatedCPT`);
        
        return {
          code: data.HCPCS || code,
          title: data.TITLE || '',
          summary: data.DESCRIPTION || '',
          globalDays: data.GLOBAL_DAYS || undefined,
          mueLimit: data.MUE_LIMIT ? parseInt(data.MUE_LIMIT) : undefined,
          allowed_modifiers: data.ALLOWED_MODIFIERS || [],
          allowed_icd_families: data.ALLOWED_ICD_FAMILIES || [],
          source: 'UpdatedCPT'
        };
      }
      
      // Step 2: Fallback to standard CPT
      const standardPath = `CPT/${code}.json`;
      const standardExists = await this.azureService.fileExists(standardPath);
      
      if (standardExists) {
        const content = await this.azureService.getFileContent(standardPath);
        const data = JSON.parse(content);
        
        this.logger.logInfo('EnhancedCPTDataService', `Retrieved ${code} from standard CPT (fallback)`);
        
        return {
          code: data.HCPCS || code,
          title: data.TITLE || '',
          summary: data.DESCRIPTION || '',
          globalDays: data.GLOBAL_DAYS || undefined,
          mueLimit: data.MUE_LIMIT ? parseInt(data.MUE_LIMIT) : undefined,
          allowed_modifiers: data.ALLOWED_MODIFIERS || [],
          allowed_icd_families: data.ALLOWED_ICD_FAMILIES || [],
          source: 'CPT'
        };
      }
      
      this.logger.logWarn('EnhancedCPTDataService', `CPT code ${code} not found in either UpdatedCPT or CPT folders`);
      return null;
      
    } catch (error) {
      this.logger.logError('EnhancedCPTDataService', `Failed to retrieve CPT code ${code}`, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Batch retrieval for multiple CPT codes with UpdatedCPT prioritization
   */
  async getBatchCptCodeData(codes: string[]): Promise<CptCodeData[]> {
    const results: CptCodeData[] = [];
    
    for (const code of codes) {
      const data = await this.getCptCodeData(code);
      if (data) {
        results.push(data);
      }
    }
    
    return results;
  }

  /**
   * Get statistics about UpdatedCPT vs standard CPT usage
   */
  getSourceStatistics(cptDataResults: CptCodeData[]): { updatedCpt: number; standardCpt: number; total: number } {
    const updatedCpt = cptDataResults.filter(r => r.source === 'UpdatedCPT').length;
    const standardCpt = cptDataResults.filter(r => r.source === 'CPT').length;
    
    return {
      updatedCpt,
      standardCpt,
      total: cptDataResults.length
    };
  }
}

async function testEnhancedCPTDataService() {
  console.log('🔧 Testing Enhanced CPT Data Service with UpdatedCPT prioritization...\n');
  
  const logger = new WorkflowLogger();
  const azureService = new AzureStorageServiceImpl(logger);
  const cptDataService = new EnhancedCPTDataService(azureService, logger);
  
  // Test codes from cholecystectomy case
  const testCodes = ['47562', '47563', '47564', '10021', '99213', '99214'];
  
  console.log('📋 Testing individual CPT code retrieval...');
  for (const code of testCodes.slice(0, 3)) { // Test first 3 codes
    console.log(`\n🔍 Testing CPT code: ${code}`);
    
    const result = await cptDataService.getCptCodeData(code);
    
    if (result) {
      console.log(`   ✅ Found: ${result.code} - ${result.title}`);
      console.log(`   📂 Source: ${result.source}`);
      console.log(`   📝 Description: ${result.summary.substring(0, 60)}...`);
      console.log(`   🌐 Global Days: ${result.globalDays || 'N/A'}`);
      console.log(`   📊 MUE Limit: ${result.mueLimit || 'N/A'}`);
    } else {
      console.log(`   ❌ Not found in either UpdatedCPT or CPT folders`);
    }
  }
  
  console.log('\n📦 Testing batch CPT code retrieval...');
  const batchResults = await cptDataService.getBatchCptCodeData(testCodes);
  
  console.log(`   ✅ Retrieved ${batchResults.length} out of ${testCodes.length} codes`);
  
  const stats = cptDataService.getSourceStatistics(batchResults);
  console.log(`   📊 Source Statistics:`);
  console.log(`      - UpdatedCPT: ${stats.updatedCpt} codes`);
  console.log(`      - Standard CPT: ${stats.standardCpt} codes`);
  console.log(`      - Total: ${stats.total} codes`);
  console.log(`      - UpdatedCPT Usage: ${Math.round((stats.updatedCpt / stats.total) * 100)}%`);
  
  return { batchResults, stats };
}

async function simulateCPTAgentWorkflow() {
  console.log('\n🤖 Simulating CPT Agent workflow with UpdatedCPT integration...\n');
  
  const logger = new WorkflowLogger();
  const azureService = new AzureStorageServiceImpl(logger);
  const cptDataService = new EnhancedCPTDataService(azureService, logger);
  const aiService = createDefaultAIModelService();
  
  // Sample operative note
  const operativeNote = `
OPERATIVE REPORT

PREOPERATIVE DIAGNOSIS: Cholelithiasis with chronic cholecystitis

POSTOPERATIVE DIAGNOSIS: Cholelithiasis with chronic cholecystitis

PROCEDURE: Laparoscopic cholecystectomy

DESCRIPTION OF PROCEDURE:
The patient was brought to the operating room and placed in supine position. After adequate general anesthesia was obtained, the patient was prepped and draped in the usual sterile fashion.

A 12mm trocar was placed at the umbilicus using the Hasson technique. CO2 insufflation was performed to 15mmHg. Three additional 5mm trocars were placed under direct visualization.

The gallbladder was grasped at the fundus and retracted cephalad. Calot's triangle was dissected carefully. The cystic artery was identified and clipped. The cystic duct was identified and clipped. The gallbladder was then dissected from the liver bed using electrocautery.

The gallbladder was placed in an extraction bag and removed through the umbilical port. All trocars were removed under direct visualization. The patient tolerated the procedure well.
`;

  try {
    // Step 1: Candidate extraction (simulated)
    console.log('📋 Step 1: Candidate CPT extraction...');
    const candidateRange = { startCode: '47560', endCode: '47570' };
    console.log(`   ✓ Identified procedure: Laparoscopic cholecystectomy`);
    console.log(`   ✓ Candidate range: ${candidateRange.startCode}-${candidateRange.endCode}`);
    
    // Step 2: Enhanced CPT data retrieval with UpdatedCPT prioritization
    console.log('\n🔍 Step 2: Enhanced CPT data retrieval...');
    const candidateCodes = [];
    for (let code = parseInt(candidateRange.startCode); code <= parseInt(candidateRange.endCode); code++) {
      candidateCodes.push(code.toString().padStart(5, '0'));
    }
    
    const cptCandidates = await cptDataService.getBatchCptCodeData(candidateCodes);
    console.log(`   ✅ Retrieved ${cptCandidates.length} CPT candidates`);
    
    const sourceStats = cptDataService.getSourceStatistics(cptCandidates);
    console.log(`   📊 Data sources: ${sourceStats.updatedCpt} from UpdatedCPT, ${sourceStats.standardCpt} from standard CPT`);
    
    // Step 3: AI-powered selection with enriched data
    if (cptCandidates.length > 0) {
      console.log('\n🧠 Step 3: AI-powered CPT selection...');
      
      const candidateDescriptions = cptCandidates.map(c => 
        `- ${c.code}: ${c.title} (${c.source}) - ${c.summary.substring(0, 80)}...`
      ).join('\n');
      
      const selectionPrompt = `Based on this operative note, select the most appropriate CPT code:

Operative Note:
${operativeNote}

Available CPT Candidates:
${candidateDescriptions}

Select the best CPT code and provide rationale.`;

      const aiResponse = await aiService.generateText(selectionPrompt);
      console.log('   ✅ AI Selection Result:');
      console.log(`   ${aiResponse}`);
      
      // Step 4: Demonstrate enhanced data usage
      console.log('\n📊 Step 4: Enhanced data utilization...');
      const selectedCode = '47562'; // Assuming AI selected this
      const selectedCptData = cptCandidates.find(c => c.code === selectedCode);
      
      if (selectedCptData) {
        console.log(`   ✅ Selected: ${selectedCptData.code} - ${selectedCptData.title}`);
        console.log(`   📂 Data source: ${selectedCptData.source}`);
        console.log(`   🌐 Global days: ${selectedCptData.globalDays || 'N/A'}`);
        console.log(`   📊 MUE limit: ${selectedCptData.mueLimit || 'N/A'}`);
        console.log(`   🏷️  Allowed modifiers: ${selectedCptData.allowed_modifiers?.slice(0, 3).join(', ') || 'None'}`);
        
        if (selectedCptData.source === 'UpdatedCPT') {
          console.log('   ✨ Using most current data from UpdatedCPT folder!');
        } else {
          console.log('   ⚠️  Using fallback data from standard CPT folder');
        }
      }
    }
    
    console.log('\n✅ CPT Agent workflow simulation completed successfully!');
    
  } catch (error) {
    console.error('❌ CPT Agent workflow simulation failed:', error);
  }
}

async function generateCPTAgentModificationRecommendations() {
  console.log('\n📝 CPT Agent Modification Recommendations...\n');
  
  console.log('🔧 Required Changes to CPT Agent:');
  console.log('');
  console.log('1. 📂 Update fetchPrimaryCptCandidates method:');
  console.log('   - Check UpdatedCPT/{code}.json first');
  console.log('   - Fall back to CPT/{code}.json if not found');
  console.log('   - Track data source for logging and analytics');
  console.log('');
  console.log('2. 📊 Enhance CptCodeData interface:');
  console.log('   - Add source field: "UpdatedCPT" | "CPT"');
  console.log('   - Include metadata about data freshness');
  console.log('');
  console.log('3. 📈 Add monitoring and metrics:');
  console.log('   - Track UpdatedCPT vs standard CPT usage');
  console.log('   - Log when UpdatedCPT data is used vs fallback');
  console.log('   - Monitor data availability across both sources');
  console.log('');
  console.log('4. 🔄 Implement caching strategy:');
  console.log('   - Cache UpdatedCPT data with higher priority');
  console.log('   - Implement TTL for UpdatedCPT vs standard CPT');
  console.log('');
  console.log('5. 🧪 Add validation:');
  console.log('   - Validate UpdatedCPT data structure');
  console.log('   - Compare UpdatedCPT vs standard CPT when both exist');
  console.log('   - Flag significant differences for review');
  
  console.log('\n💡 Implementation Pattern:');
  console.log(`
async fetchPrimaryCptCandidates(context, codeRange) {
  const cptCodeData = [];
  
  for (let code = startCode; code <= endCode; code++) {
    const codeStr = code.toString().padStart(5, '0');
    
    // Try UpdatedCPT first
    let cptData = await this.getCptFromUpdatedFolder(codeStr);
    let source = 'UpdatedCPT';
    
    // Fallback to standard CPT
    if (!cptData) {
      cptData = await this.getCptFromStandardFolder(codeStr);
      source = 'CPT';
    }
    
    if (cptData) {
      cptCodeData.push({ ...cptData, source });
      logger.logInfo(this.name, \`Retrieved \${codeStr} from \${source}\`);
    }
  }
  
  return cptCodeData;
}
`);
}

async function runComprehensiveTest() {
  console.log('🚀 Starting Comprehensive UpdatedCPT Integration Test...\n');
  
  try {
    // Test 1: Enhanced CPT Data Service
    const serviceResults = await testEnhancedCPTDataService();
    
    // Test 2: CPT Agent workflow simulation
    await simulateCPTAgentWorkflow();
    
    // Test 3: Generate recommendations
    await generateCPTAgentModificationRecommendations();
    
    // Summary
    console.log('\n🎯 Test Summary:');
    console.log(`   📊 CPT codes tested: ${serviceResults.batchResults.length}`);
    console.log(`   📂 UpdatedCPT usage: ${serviceResults.stats.updatedCpt} codes`);
    console.log(`   📂 Standard CPT fallback: ${serviceResults.stats.standardCpt} codes`);
    console.log(`   📈 UpdatedCPT coverage: ${Math.round((serviceResults.stats.updatedCpt / serviceResults.stats.total) * 100)}%`);
    
    if (serviceResults.stats.updatedCpt > 0) {
      console.log('\n✅ UpdatedCPT integration is working correctly!');
      console.log('🔧 Ready to implement changes in CPT Agent');
    } else {
      console.log('\n⚠️  UpdatedCPT folder may not be populated yet');
      console.log('📋 Ensure UpdatedCPT data is uploaded to Azure Storage');
    }
    
  } catch (error) {
    console.error('❌ Comprehensive test failed:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the comprehensive test
runComprehensiveTest().catch((error) => {
  console.error('❌ Test script failed:', error);
  process.exit(1);
});