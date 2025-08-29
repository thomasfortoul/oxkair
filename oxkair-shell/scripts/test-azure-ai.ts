#!/usr/bin/env tsx

/**
 * Test script for Azure OpenAI connection
 */

import { createDefaultAIModelService } from '../lib/services/ai-model-service.ts';
import { AzureStorageServiceImpl } from '../lib/services/azure-storage-service.ts';
import { WorkflowLogger } from '../app/coder/lib/logging.ts';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from the correct path
dotenv.config({ path: '.env.local' });

async function testAzureAI() {
  console.log('Testing Azure OpenAI connection...');
  
  // Debug environment variables
  console.log('Environment variables:');
  console.log('AZURE_OPENAI_ENDPOINT:', process.env.AZURE_OPENAI_ENDPOINT);
  console.log('AZURE_OPENAI_DEPLOYMENT_NAME:', process.env.AZURE_OPENAI_DEPLOYMENT_NAME);
  console.log('AZURE_OPENAI_API_VERSION:', process.env.AZURE_OPENAI_API_VERSION);
  console.log('AZURE_OPENAI_API_KEY:', process.env.AZURE_OPENAI_API_KEY ? '[SET]' : '[NOT SET]');
  console.log('');
  
  const aiService = createDefaultAIModelService();
  
  try {
    // Test connection
    console.log('Testing connection...');
    const connectionTest = await aiService.testConnection();
    console.log('Connection test result:', connectionTest);
    
    if (connectionTest.success) {
      // Test text generation
      console.log('\nTesting text generation...');
      const textResult = await aiService.generateText('Say hello and confirm you are working correctly.');
      console.log('Text generation result:', textResult);
      
      // Test structured output
      console.log('\nTesting structured output...');
      const structuredResult = await aiService.generateStructuredOutput(
        'Generate a simple JSON object with name and status fields',
        {
          type: 'object',
          properties: {
            name: { type: 'string' },
            status: { type: 'string' }
          },
          required: ['name', 'status']
        }
      );
      console.log('Structured output result:', structuredResult);
      
      // Show usage stats
      console.log('\\nUsage statistics:', aiService.getUsageStats());
      
      // Test UpdatedCPT integration with AI
      console.log('\\nTesting UpdatedCPT integration with AI...');
      await testUpdatedCPTWithAI(aiService);
      
    } else {
      console.error('Connection test failed:', connectionTest.error);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

async function testUpdatedCPTWithAI(aiService: any) {
  console.log('🤖 Testing AI integration with UpdatedCPT data...');
  
  const logger = new WorkflowLogger();
  const azureService = new AzureStorageServiceImpl(logger);
  
  try {
    // Test if we can access UpdatedCPT data
    const testCode = '47562';
    const updatedCptPath = `UpdatedCPT/${testCode}.json`;
    
    console.log(`\\n📋 Testing UpdatedCPT data access for CPT code ${testCode}:`);
    
    const exists = await azureService.fileExists(updatedCptPath);
    console.log(`   UpdatedCPT/${testCode}.json exists: ${exists}`);
    
    if (exists) {
      const content = await azureService.getFileContent(updatedCptPath);
      const cptData = JSON.parse(content);
      
      console.log(`   ✓ Retrieved CPT data successfully`);
      console.log(`   ✓ HCPCS: ${cptData.HCPCS}`);
      console.log(`   ✓ Title: ${cptData.TITLE?.substring(0, 50)}...`);
      
      // Test AI understanding of the CPT data
      const prompt = `
You are a medical coding expert. Analyze this CPT code data and provide a brief summary:

CPT Code: ${cptData.HCPCS}
Title: ${cptData.TITLE}
Description: ${cptData.DESCRIPTION}

Provide a 2-sentence summary of what this procedure involves.`;

      console.log('\\n🧠 Testing AI analysis of UpdatedCPT data...');
      const aiResponse = await aiService.generateText(prompt);
      console.log('   ✓ AI Analysis Result:', aiResponse);
      
      // Test structured output with CPT data
      console.log('\\n📊 Testing structured output with UpdatedCPT data...');
      const structuredPrompt = `Analyze this CPT code and return structured information:
CPT Code: ${cptData.HCPCS}
Title: ${cptData.TITLE}
Description: ${cptData.DESCRIPTION}`;

      const structuredResult = await aiService.generateStructuredOutput(
        structuredPrompt,
        {
          type: 'object',
          properties: {
            code: { type: 'string' },
            category: { type: 'string' },
            complexity: { type: 'string', enum: ['low', 'medium', 'high'] },
            bodySystem: { type: 'string' },
            isMinimallyInvasive: { type: 'boolean' }
          },
          required: ['code', 'category', 'complexity']
        }
      );
      console.log('   ✓ Structured Analysis:', JSON.stringify(structuredResult, null, 2));
      
    } else {
      console.log(`   ⚠️  UpdatedCPT/${testCode}.json not found - testing with mock data`);
      
      // Test with mock CPT data structure
      const mockCptData = {
        HCPCS: '47562',
        TITLE: 'Laparoscopic cholecystectomy',
        DESCRIPTION: 'Laparoscopic removal of gallbladder',
        GLOBAL_DAYS: '090'
      };
      
      const mockPrompt = `Analyze this CPT procedure: ${mockCptData.TITLE} (${mockCptData.HCPCS})`;
      const mockResponse = await aiService.generateText(mockPrompt);
      console.log('   ✓ AI Mock Analysis:', mockResponse);
    }
    
    // Test CPT Agent simulation pattern
    console.log('\\n🔧 Testing CPT Agent integration pattern...');
    await testCPTAgentPattern(azureService, aiService);
    
  } catch (error) {
    console.error('   ❌ UpdatedCPT AI integration test failed:', error);
  }
}

async function testCPTAgentPattern(azureService: AzureStorageServiceImpl, aiService: any) {
  console.log('🎯 Simulating CPT Agent UpdatedCPT integration pattern...');
  
  // Sample operative note for testing
  const sampleNote = `
OPERATIVE REPORT
PREOPERATIVE DIAGNOSIS: Cholelithiasis with chronic cholecystitis
POSTOPERATIVE DIAGNOSIS: Cholelithiasis with chronic cholecystitis
PROCEDURE: Laparoscopic cholecystectomy

DESCRIPTION OF PROCEDURE:
The patient was brought to the operating room and placed in supine position. 
A 12mm trocar was placed at the umbilicus using the Hasson technique. 
CO2 insufflation was performed to 15mmHg. Three additional 5mm trocars were placed.
The gallbladder was grasped at the fundus and retracted cephalad. 
Calot's triangle was dissected carefully. The cystic artery and duct were clipped.
The gallbladder was dissected from the liver bed and removed through the umbilical port.
The patient tolerated the procedure well.`;

  try {
    // Step 1: Simulate candidate extraction
    console.log('\\n📋 Step 1: Simulating candidate CPT extraction...');
    const candidatePrompt = `Analyze this operative note and identify the primary procedure and suggest a CPT code range:

${sampleNote}

What is the main procedure and what CPT code range should we search (e.g., 47560-47570)?`;

    const candidateResponse = await aiService.generateText(candidatePrompt);
    console.log('   ✓ Candidate extraction result:', candidateResponse);
    
    // Step 2: Simulate UpdatedCPT lookup
    console.log('\\n🔍 Step 2: Simulating UpdatedCPT data lookup...');
    const testCodes = ['47562', '47563', '47564'];
    const cptDataResults = [];
    
    for (const code of testCodes) {
      try {
        // Try UpdatedCPT first (preferred)
        const updatedPath = `UpdatedCPT/${code}.json`;
        const updatedExists = await azureService.fileExists(updatedPath);
        
        if (updatedExists) {
          const content = await azureService.getFileContent(updatedPath);
          const data = JSON.parse(content);
          cptDataResults.push({ code, source: 'UpdatedCPT', data });
          console.log(`   ✓ Found ${code} in UpdatedCPT`);
        } else {
          // Fallback to standard CPT
          const standardPath = `CPT/${code}.json`;
          const standardExists = await azureService.fileExists(standardPath);
          
          if (standardExists) {
            const content = await azureService.getFileContent(standardPath);
            const data = JSON.parse(content);
            cptDataResults.push({ code, source: 'CPT', data });
            console.log(`   ✓ Found ${code} in standard CPT (fallback)`);
          } else {
            console.log(`   ⚠️  Code ${code} not found in either UpdatedCPT or CPT`);
          }
        }
      } catch (error) {
        console.log(`   ❌ Error looking up ${code}: ${error}`);
      }
    }
    
    // Step 3: Simulate final selection with enriched data
    if (cptDataResults.length > 0) {
      console.log('\\n🎯 Step 3: Simulating final CPT selection with enriched data...');
      
      const enrichedPrompt = `Based on this operative note and the available CPT codes, select the most appropriate code:

Operative Note:
${sampleNote}

Available CPT Codes:
${cptDataResults.map(r => `- ${r.code}: ${r.data.TITLE} (Source: ${r.source})`).join('\\n')}

Select the best CPT code and explain why.`;

      const selectionResponse = await aiService.generateText(enrichedPrompt);
      console.log('   ✓ Final selection result:', selectionResponse);
      
      console.log('\\n✅ CPT Agent pattern simulation completed successfully!');
      console.log('💡 Recommendation: Modify CPT Agent to prioritize UpdatedCPT over standard CPT folder');
    } else {
      console.log('   ⚠️  No CPT data found for simulation');
    }
    
  } catch (error) {
    console.error('   ❌ CPT Agent pattern simulation failed:', error);
  }
}

testAzureAI().catch(console.error);