#!/usr/bin/env tsx

/**
 * Test script to verify AI model connections in Vercel environment
 */

import { createDefaultAIModelService } from '../lib/services/ai-model-service';

async function testAIConnection() {
  console.log('=== AI Connection Test ===');
  console.log('Environment:', process.env.NODE_ENV);
  console.log('Vercel:', process.env.VERCEL);
  console.log('Timestamp:', new Date().toISOString());
  
  // Check environment variables
  console.log('\n=== Environment Variables ===');
  console.log('AZURE_OPENAI_API_KEY:', process.env.AZURE_OPENAI_API_KEY ? 'SET' : 'MISSING');
  console.log('AZURE_OPENAI_ENDPOINT:', process.env.AZURE_OPENAI_ENDPOINT ? 'SET' : 'MISSING');
  console.log('AZURE_OPENAI_DEPLOYMENT_NAME:', process.env.AZURE_OPENAI_DEPLOYMENT_NAME ? 'SET' : 'MISSING');
  console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'SET' : 'MISSING');
  
  // Test AI service
  console.log('\n=== Testing AI Model Service ===');
  try {
    const aiService = createDefaultAIModelService();
    console.log('AI Service created successfully');
    
    const connectionTest = await aiService.testConnection();
    console.log('Connection test result:', connectionTest);
    
    if (connectionTest.success) {
      console.log('✅ AI connection successful');
      
      // Test a simple generation
      console.log('\n=== Testing Text Generation ===');
      const testResult = await aiService.generateText('Say "Hello World" and nothing else.');
      console.log('Generation result:', testResult);
      
    } else {
      console.log('❌ AI connection failed:', connectionTest.error);
    }
    
  } catch (error) {
    console.error('❌ AI Service error:', error);
  }
}

// Run the test
testAIConnection().catch(console.error);