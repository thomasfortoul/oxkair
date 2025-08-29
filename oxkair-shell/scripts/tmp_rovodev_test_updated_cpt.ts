#!/usr/bin/env tsx

/**
 * Test script for UpdatedCPT folder integration
 * Tests both Azure Storage access and CPT Agent usage of UpdatedCPT data
 */

import { AzureStorageServiceImpl } from '../lib/services/azure-storage-service.ts';
import { CPTAgent } from '../lib/agents/cpt-agent.ts';
import { WorkflowLogger } from '../app/coder/lib/logging.ts';
import { createDefaultAIModelService } from '../lib/services/ai-model-service.ts';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Test CPT codes that should exist in UpdatedCPT folder
const TEST_UPDATED_CPT_CODES = [
  '47562', // Cholecystectomy - commonly used in test cases
  '47563', // Related cholecystectomy code
  '47564', // Related cholecystectomy code
  '10021', // Sample code for testing
  '99213', // Common office visit code
];

async function testUpdatedCPTAccess() {
  console.log('🔍 Testing UpdatedCPT folder access...\n');
  
  const logger = new WorkflowLogger();
  const azureService = new AzureStorageServiceImpl(logger);
  
  let successCount = 0;
  let failureCount = 0;
  const foundCodes: string[] = [];
  const missingCodes: string[] = [];
  
  for (const code of TEST_UPDATED_CPT_CODES) {
    const filePath = `UpdatedCPT/${code}.json`;
    console.log(`📁 Testing UpdatedCPT file: ${filePath}`);
    
    try {
      // Test file existence
      const exists = await azureService.fileExists(filePath);
      console.log(`   ✓ File exists: ${exists}`);
      
      if (exists) {
        // Test file content retrieval
        const startTime = Date.now();
        const content = await azureService.getFileContent(filePath);
        const timeTaken = Date.now() - startTime;
        
        console.log(`   ✓ Content retrieved successfully`);
        console.log(`   ✓ Content length: ${content.length} characters`);
        console.log(`   ✓ Time taken: ${timeTaken}ms`);
        
        // Parse and validate JSON structure
        try {
          const parsed = JSON.parse(content);
          console.log(`   ✓ Valid JSON structure`);
          
          // Check for expected CPT data fields
          const expectedFields = ['HCPCS', 'TITLE', 'DESCRIPTION', 'GLOBAL_DAYS'];
          const presentFields = expectedFields.filter(field => field in parsed);
          const missingFields = expectedFields.filter(field => !(field in parsed));
          
          console.log(`   ✓ Present fields: ${presentFields.join(', ')}`);
          if (missingFields.length > 0) {
            console.log(`   ⚠️  Missing fields: ${missingFields.join(', ')}`);
          }
          
          // Show sample data
          console.log(`   ✓ HCPCS: ${parsed.HCPCS || 'N/A'}`);
          console.log(`   ✓ Title: ${parsed.TITLE ? parsed.TITLE.substring(0, 50) + '...' : 'N/A'}`);
          console.log(`   ✓ Description: ${parsed.DESCRIPTION ? parsed.DESCRIPTION.substring(0, 50) + '...' : 'N/A'}`);
          
          foundCodes.push(code);
          successCount++;
        } catch (parseError) {
          console.log(`   ❌ Content is not valid JSON: ${parseError}`);
          failureCount++;
        }
      } else {
        console.log(`   ⚠️  File does not exist in UpdatedCPT folder`);
        missingCodes.push(code);
        failureCount++;
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      failureCount++;
    }
    
    console.log(''); // Empty line for readability
  }
  
  // Test directory listing
  console.log('📂 Testing UpdatedCPT directory listing...');
  try {
    const files = await azureService.listFiles('UpdatedCPT');
    console.log(`   ✓ Found ${files.length} files in UpdatedCPT directory`);
    console.log(`   ✓ Sample files: ${files.slice(0, 5).join(', ')}`);
    
    // Check if our test codes are in the directory
    const availableCodes = files.map(f => f.replace('.json', ''));
    const testCodesInDir = TEST_UPDATED_CPT_CODES.filter(code => availableCodes.includes(code));
    console.log(`   ✓ Test codes available in directory: ${testCodesInDir.join(', ')}`);
    
  } catch (error) {
    console.log(`   ❌ Directory listing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    failureCount++;
  }
  
  console.log('\n📋 UpdatedCPT Access Summary:');
  console.log(`   ✅ Successfully accessed codes: ${foundCodes.join(', ')}`);
  console.log(`   ❌ Missing codes: ${missingCodes.join(', ')}`);
  console.log(`   📈 Success rate: ${Math.round((successCount / (successCount + failureCount)) * 100)}%`);
  
  return { foundCodes, missingCodes, successCount, failureCount };
}

async function testCPTAgentWithUpdatedCPT() {
  console.log('\n🤖 Testing CPT Agent integration with UpdatedCPT...\n');
  
  // Sample operative note for cholecystectomy (uses CPT 47562)
  const sampleNote = `
OPERATIVE REPORT

PREOPERATIVE DIAGNOSIS: Cholelithiasis with chronic cholecystitis

POSTOPERATIVE DIAGNOSIS: Cholelithiasis with chronic cholecystitis

PROCEDURE: Laparoscopic cholecystectomy

DESCRIPTION OF PROCEDURE:
The patient was brought to the operating room and placed in supine position. After adequate general anesthesia was obtained, the patient was prepped and draped in the usual sterile fashion.

A 12mm trocar was placed at the umbilicus using the Hasson technique. CO2 insufflation was performed to 15mmHg. Three additional 5mm trocars were placed under direct visualization - one at the epigastrium, one at the anterior axillary line below the costal margin, and one at the midclavicular line below the costal margin.

The gallbladder was grasped at the fundus and retracted cephalad. Calot's triangle was dissected carefully. The cystic artery was identified and clipped with clips. The cystic duct was identified and clipped with clips. The gallbladder was then dissected from the liver bed using electrocautery.

The gallbladder was placed in an extraction bag and removed through the umbilical port. All trocars were removed under direct visualization. The fascia at the umbilical port was closed with 0-Vicryl suture. The skin was closed with 4-0 Monocryl suture.

The patient tolerated the procedure well and was taken to recovery in stable condition.
`;

  try {
    // Note: This is a conceptual test - the actual CPT agent would need to be modified
    // to use UpdatedCPT folder. For now, we'll test the data access pattern.
    
    const logger = new WorkflowLogger();
    const azureService = new AzureStorageServiceImpl(logger);
    
    console.log('📋 Testing UpdatedCPT data retrieval pattern for CPT Agent...');
    
    // Test the pattern that CPT agent should use for UpdatedCPT
    const testCode = '47562';
    const updatedCptPath = `UpdatedCPT/${testCode}.json`;
    const standardCptPath = `CPT/${testCode}.json`;
    
    console.log(`\n🔍 Comparing UpdatedCPT vs standard CPT data for code ${testCode}:`);
    
    // Check UpdatedCPT version
    try {
      const updatedExists = await azureService.fileExists(updatedCptPath);
      console.log(`   UpdatedCPT/${testCode}.json exists: ${updatedExists}`);
      
      if (updatedExists) {
        const updatedContent = await azureService.getFileContent(updatedCptPath);
        const updatedData = JSON.parse(updatedContent);
        console.log(`   ✓ UpdatedCPT data - Title: ${updatedData.TITLE?.substring(0, 50)}...`);
        console.log(`   ✓ UpdatedCPT data - Description: ${updatedData.DESCRIPTION?.substring(0, 50)}...`);
      }
    } catch (error) {
      console.log(`   ❌ Error accessing UpdatedCPT: ${error}`);
    }
    
    // Check standard CPT version
    try {
      const standardExists = await azureService.fileExists(standardCptPath);
      console.log(`   CPT/${testCode}.json exists: ${standardExists}`);
      
      if (standardExists) {
        const standardContent = await azureService.getFileContent(standardCptPath);
        const standardData = JSON.parse(standardContent);
        console.log(`   ✓ Standard CPT data - Title: ${standardData.TITLE?.substring(0, 50)}...`);
        console.log(`   ✓ Standard CPT data - Description: ${standardData.DESCRIPTION?.substring(0, 50)}...`);
      }
    } catch (error) {
      console.log(`   ❌ Error accessing standard CPT: ${error}`);
    }
    
    console.log('\n💡 Recommendation: CPT Agent should prioritize UpdatedCPT over standard CPT folder');
    console.log('   - Check UpdatedCPT/{code}.json first');
    console.log('   - Fall back to CPT/{code}.json if not found');
    console.log('   - This ensures the most current CPT data is used');
    
  } catch (error) {
    console.log(`❌ CPT Agent integration test failed: ${error}`);
  }
}

async function runAllTests() {
  console.log('🚀 Starting UpdatedCPT Integration Tests...\n');
  
  try {
    // Test 1: UpdatedCPT folder access
    const accessResults = await testUpdatedCPTAccess();
    
    // Test 2: CPT Agent integration pattern
    await testCPTAgentWithUpdatedCPT();
    
    // Summary
    console.log('\n🎯 Overall Test Summary:');
    console.log(`   UpdatedCPT files found: ${accessResults.foundCodes.length}`);
    console.log(`   UpdatedCPT files missing: ${accessResults.missingCodes.length}`);
    
    if (accessResults.foundCodes.length > 0) {
      console.log('\n✅ UpdatedCPT folder is accessible and contains valid data');
      console.log('🔧 Next steps: Modify CPT Agent to prioritize UpdatedCPT folder');
    } else {
      console.log('\n⚠️  UpdatedCPT folder may not be populated yet');
      console.log('🔧 Next steps: Ensure UpdatedCPT data is uploaded to Azure Storage');
    }
    
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the tests
runAllTests().catch((error) => {
  console.error('❌ Test script failed:', error);
  process.exit(1);
});