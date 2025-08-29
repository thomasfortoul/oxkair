#!/usr/bin/env ts-node

/**
 * Azure Storage Service Test Script
 * 
 * This script tests the Azure Storage Service by attempting to fetch various test files
 * from Azure Blob Storage. It provides a simple way to verify connectivity and data retrieval.
 */

import { AzureStorageServiceImpl } from '../lib/services/azure-storage-service.ts';
import { WorkflowLogger } from '../app/coder/lib/logging.ts';

// Test file paths - these should exist in the Azure Blob Storage 'data' container
const TEST_FILES = [
  'Codes/CPT.json',
  'Codes/ICD10.json', 
  // 'RVU/gpci_output.json',
  'RVU/location_crosswalk.json',
  'RVU/hcpcs_records/A0021.json', // Sample HCPCS record
  'Codes/processed_codes/J30.json', // Sample processed ICD-10 code
  'Codes/processed_codes/',
  'UpdatedCPT/47562.json'
];

// Additional UpdatedCPT test files
const UPDATED_CPT_TEST_FILES = [
  'UpdatedCPT/47562.json', // Cholecystectomy - primary test case
  'UpdatedCPT/47563.json', // Related cholecystectomy code
  'UpdatedCPT/47564.json', // Related cholecystectomy code
  'UpdatedCPT/10021.json', // Sample code
  'UpdatedCPT/99213.json', // Common office visit
  'UpdatedCPT/99214.json', // Common office visit
  'UpdatedCPT/99215.json', // Common office visit
];

async function testUpdatedCPTFolder(azureService: AzureStorageServiceImpl, logger: WorkflowLogger) {
  console.log('\n🔍 Detailed UpdatedCPT Folder Testing...\n');
  
  let updatedCptSuccessCount = 0;
  let updatedCptFailureCount = 0;
  const foundUpdatedCodes: string[] = [];
  const missingUpdatedCodes: string[] = [];
  
  for (const filePath of UPDATED_CPT_TEST_FILES) {
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
          const expectedFields = ['HCPCS', 'TITLE', 'DESCRIPTION', 'GLOBAL_DAYS', 'MUE_LIMIT'];
          const presentFields = expectedFields.filter(field => field in parsed);
          const missingFields = expectedFields.filter(field => !(field in parsed));
          
          console.log(`   ✓ Present fields: ${presentFields.join(', ')}`);
          if (missingFields.length > 0) {
            console.log(`   ⚠️  Missing optional fields: ${missingFields.join(', ')}`);
          }
          
          // Show sample data
          console.log(`   ✓ HCPCS: ${parsed.HCPCS || 'N/A'}`);
          console.log(`   ✓ Title: ${parsed.TITLE ? parsed.TITLE.substring(0, 50) + '...' : 'N/A'}`);
          console.log(`   ✓ Description: ${parsed.DESCRIPTION ? parsed.DESCRIPTION.substring(0, 50) + '...' : 'N/A'}`);
          console.log(`   ✓ Global Days: ${parsed.GLOBAL_DAYS || 'N/A'}`);
          
          // Extract code from file path for tracking
          const code = filePath.split('/')[1].replace('.json', '');
          foundUpdatedCodes.push(code);
          updatedCptSuccessCount++;
          
        } catch (parseError) {
          console.log(`   ❌ Content is not valid JSON: ${parseError}`);
          updatedCptFailureCount++;
        }
      } else {
        console.log(`   ⚠️  File does not exist in UpdatedCPT folder`);
        const code = filePath.split('/')[1].replace('.json', '');
        missingUpdatedCodes.push(code);
        updatedCptFailureCount++;
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      updatedCptFailureCount++;
    }
    
    console.log(''); // Empty line for readability
  }
  
  // Compare with standard CPT folder for codes that exist in both
  console.log('🔄 Comparing UpdatedCPT vs Standard CPT data...');
  for (const code of foundUpdatedCodes.slice(0, 3)) { // Test first 3 found codes
    try {
      const updatedPath = `UpdatedCPT/${code}.json`;
      const standardPath = `CPT/${code}.json`;
      
      console.log(`\n📊 Comparing code ${code}:`);
      
      const [updatedExists, standardExists] = await Promise.all([
        azureService.fileExists(updatedPath),
        azureService.fileExists(standardPath)
      ]);
      
      console.log(`   UpdatedCPT exists: ${updatedExists}, Standard CPT exists: ${standardExists}`);
      
      if (updatedExists && standardExists) {
        const [updatedContent, standardContent] = await Promise.all([
          azureService.getFileContent(updatedPath),
          azureService.getFileContent(standardPath)
        ]);
        
        const updatedData = JSON.parse(updatedContent);
        const standardData = JSON.parse(standardContent);
        
        console.log(`   ✓ Updated Title: ${updatedData.TITLE?.substring(0, 40)}...`);
        console.log(`   ✓ Standard Title: ${standardData.TITLE?.substring(0, 40)}...`);
        
        // Check if data is different
        const isDifferent = JSON.stringify(updatedData) !== JSON.stringify(standardData);
        console.log(`   ${isDifferent ? '🔄' : '✅'} Data differs: ${isDifferent}`);
      }
    } catch (error) {
      console.log(`   ❌ Comparison failed for ${code}: ${error}`);
    }
  }
  
  console.log('\n📋 UpdatedCPT Test Summary:');
  console.log(`   ✅ Successfully accessed UpdatedCPT codes: ${foundUpdatedCodes.join(', ')}`);
  console.log(`   ❌ Missing UpdatedCPT codes: ${missingUpdatedCodes.join(', ')}`);
  console.log(`   📈 UpdatedCPT success rate: ${Math.round((updatedCptSuccessCount / (updatedCptSuccessCount + updatedCptFailureCount)) * 100)}%`);
  
  return { foundUpdatedCodes, missingUpdatedCodes, updatedCptSuccessCount, updatedCptFailureCount };
}

async function runTests() {
  console.log('🚀 Starting Azure Storage Service Tests...\n');
  
  const logger = new WorkflowLogger();
  const azureService = new AzureStorageServiceImpl(logger);
  
  let successCount = 0;
  let failureCount = 0;
  
  for (const filePath of TEST_FILES) {
    console.log(`📁 Testing file: ${filePath}`);
    
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
        
        // Try to parse as JSON if it's a .json file
        if (filePath.endsWith('.json')) {
          try {
            const parsed = JSON.parse(content);
            console.log(`   ✓ Valid JSON structure`);
            
            // Show a sample of the content structure
            if (Array.isArray(parsed)) {
              console.log(`   ✓ Array with ${parsed.length} items`);
            } else if (typeof parsed === 'object') {
              const keys = Object.keys(parsed);
              console.log(`   ✓ Object with keys: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`);
            }
          } catch (parseError) {
            console.log(`   ⚠️  Content is not valid JSON`);
          }
        }
        
        successCount++;
      } else {
        console.log(`   ⚠️  File does not exist - this may be expected for test files`);
        failureCount++;
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      failureCount++;
    }
    
    console.log(''); // Empty line for readability
  }
  
  // Test UpdatedCPT folder specifically
  console.log('🔍 Testing UpdatedCPT folder specifically...');
  await testUpdatedCPTFolder(azureService, logger);
  
  // Test directory listing
  console.log('📂 Testing directory listing...');
  try {
    const files = await azureService.listFilesByName('Codes/processed_codes/J30');
    console.log(`   ✓ Found ${files.length} files in processed_codes directory`);
    console.log(`   ✓ Sample files: ${files.slice(0, 3).join(', ')}`);
  } catch (error) {
    console.log(`   ❌ Directory listing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    failureCount++;
  }
  console.log('📂 Testing directory listing...');
  try {
    const files = await azureService.listFiles('RVU/hcpcs_records');
    console.log(`   ✓ Found ${files.length} files in processed_codes directory`);
    console.log(`   ✓ Sample files: ${files.slice(0, 3).join(', ')}`);
  } catch (error) {
    console.log(`   ❌ Directory listing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    failureCount++;
  }
  console.log('📂 Testing CCI directory listing...');
  try {
    const files = await azureService.listFiles('CCI');
    console.log(`   ✓ Found ${files.length} files in CCI directory`);
    console.log(`   ✓ Sample files: ${files.slice(0, 3).join(', ')}`);
  } catch (error) {
    console.log(`   ❌ CCI directory listing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    failureCount++;
  }

  console.log('📂 Testing UpdatedCPT directory listing...');
  try {
    const files = await azureService.listFiles('UpdatedCPT');
    console.log(`   ✓ Found ${files.length} files in UpdatedCPT directory`);
    console.log(`   ✓ Sample files: ${files.slice(0, 5).join(', ')}`);
    
    // Test specific codes we expect
    const expectedCodes = ['47562', '47563', '47564', '10021', '99213'];
    const availableCodes = files.map(f => f.replace('.json', ''));
    const foundExpectedCodes = expectedCodes.filter(code => availableCodes.includes(code));
    console.log(`   ✓ Expected test codes found: ${foundExpectedCodes.join(', ')}`);
    
    if (foundExpectedCodes.length === 0) {
      console.log(`   ⚠️  None of the expected test codes found in UpdatedCPT`);
    }
  } catch (error) {
    console.log(`   ❌ UpdatedCPT directory listing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    failureCount++;
  }
  
  // Show cache statistics
  console.log('\n📊 Cache Statistics:');
  const cacheStats = azureService.getCacheStats();
  console.log(`   Cache size: ${cacheStats.size} items`);
  console.log(`   Hit rate: ${cacheStats.hitRate}%`);
  
  // Summary
  console.log('\n📋 Test Summary:');
  console.log(`   ✅ Successful operations: ${successCount}`);
  console.log(`   ❌ Failed operations: ${failureCount}`);
  console.log(`   📈 Success rate: ${Math.round((successCount / (successCount + failureCount)) * 100)}%`);
  
  if (failureCount === 0) {
    console.log('\n🎉 All tests passed! Azure Storage Service is working correctly.');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Please check the Azure Storage configuration and file availability.');
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the tests
runTests().catch((error) => {
  console.error('❌ Test script failed:', error);
  process.exit(1);
});