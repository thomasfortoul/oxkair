#!/usr/bin/env node

/**
 * Test Azure OpenAI connection with proper environment loading
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

import { AIModelService } from './lib/services/ai-model-service.ts';

async function testAzureConnection() {
  console.log('=== Azure OpenAI Connection Test ===\n');

  // Check environment variables after loading
  console.log('Environment Variables (after loading .env.local):');
  console.log('AZURE_OPENAI_ENDPOINT:', process.env.AZURE_OPENAI_ENDPOINT || 'NOT SET');
  console.log('AZURE_OPENAI_API_KEY:', process.env.AZURE_OPENAI_API_KEY ? 'SET (length: ' + process.env.AZURE_OPENAI_API_KEY.length + ')' : 'NOT SET');
  console.log('AZURE_OPENAI_DEPLOYMENT_NAME:', process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'NOT SET');
  console.log('AZURE_OPENAI_API_VERSION:', process.env.AZURE_OPENAI_API_VERSION || 'NOT SET');
  console.log();

  // Test with direct client (bypassing SimpleBackendManager)
  console.log('Testing with direct Azure client...');
  try {
    const aiService = new AIModelService({
      provider: 'azure',
      model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4.1-mini',
      temperature: 0.1,
      maxTokens: 100,
      timeout: 30000
    }, undefined, 'test_agent', true); // Use direct client

    console.log('AI Service created successfully');
    
    const testResult = await aiService.testConnection();
    console.log('Connection test result:', testResult);

    if (testResult.success) {
      console.log('✅ Azure OpenAI connection successful!');
      
      // Test a simple generation
      console.log('\nTesting text generation...');
      const response = await aiService.generateText('Say "Hello, Azure OpenAI is working!"');
      console.log('Generated response:', response);
    } else {
      console.log('❌ Azure OpenAI connection failed:', testResult.error);
    }

  } catch (error) {
    console.error('❌ Error during connection test:', error);
  }

  // Test the problematic deployment name that might be causing 404
  console.log('\n=== Testing specific deployment names ===');
  
  const deploymentsToTest = [
    process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
    'gpt-4.1-mini',
    'o4-mini',
    'gpt-4.1',
    'gpt-4.1-2'
  ].filter(Boolean);

  for (const deployment of deploymentsToTest) {
    console.log(`\nTesting deployment: ${deployment}`);
    try {
      const aiService = new AIModelService({
        provider: 'azure',
        model: deployment,
        temperature: 0.1,
        maxTokens: 50,
        timeout: 15000
      }, undefined, 'test_agent', true);

      const response = await aiService.generateText('Test');
      console.log(`✅ ${deployment}: SUCCESS - ${response.substring(0, 50)}...`);
    } catch (error: any) {
      console.log(`❌ ${deployment}: FAILED - ${error.message}`);
      if (error.message.includes('404')) {
        console.log(`   → This deployment name likely doesn't exist on the endpoint`);
      }
    }
  }
}

testAzureConnection().catch(console.error);