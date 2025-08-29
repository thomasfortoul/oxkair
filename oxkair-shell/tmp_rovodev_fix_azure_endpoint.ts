#!/usr/bin/env node

/**
 * Fix Azure OpenAI endpoint and test different configurations
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

async function fixAzureEndpoint() {
  console.log('=== Fixing Azure OpenAI Endpoint Configuration ===\n');

  let endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;

  console.log('Original endpoint:', endpoint);
  console.log('API Key present:', !!apiKey);
  console.log();

  // Fix endpoint URL format if needed
  if (endpoint && !endpoint.endsWith('/')) {
    endpoint = endpoint + '/';
    console.log('Fixed endpoint (added trailing slash):', endpoint);
  }

  // Try different API versions that are known to work
  const apiVersionsToTry = [
    '2024-12-01-preview',
    '2024-10-21',
    '2024-08-01-preview',
    '2024-06-01',
    '2024-02-15-preview',
    '2023-12-01-preview'
  ];

  console.log('Testing different API versions...\n');

  for (const apiVersion of apiVersionsToTry) {
    console.log(`Testing API version: ${apiVersion}`);
    
    try {
      // Try to list deployments
      const deploymentsUrl = `${endpoint}openai/deployments?api-version=${apiVersion}`;
      
      const response = await fetch(deploymentsUrl, {
        method: 'GET',
        headers: {
          'api-key': apiKey!,
          'Content-Type': 'application/json'
        }
      });

      console.log(`  Status: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const data = await response.json();
        console.log('  ✅ SUCCESS! This API version works');
        console.log('  Available deployments:');
        
        if (data.data && Array.isArray(data.data)) {
          data.data.forEach((deployment: any) => {
            console.log(`    - ${deployment.id} (${deployment.model || 'Unknown model'})`);
          });
          
          // Update .env.local with working configuration
          console.log('\n=== Recommended .env.local Updates ===');
          console.log(`AZURE_OPENAI_API_VERSION=${apiVersion}`);
          if (data.data.length > 0) {
            console.log(`AZURE_OPENAI_DEPLOYMENT_NAME=${data.data[0].id}`);
          }
          
          return; // Exit on first success
        } else {
          console.log('  No deployments found in response');
        }
      } else {
        const errorText = await response.text();
        console.log(`  ❌ Failed: ${errorText.substring(0, 100)}...`);
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    console.log();
  }

  // If all API versions fail, try a simple chat completion to test basic connectivity
  console.log('=== Testing Basic Chat Completion ===');
  
  // Try with a common deployment name pattern
  const commonDeploymentNames = [
    'gpt-4',
    'gpt-4-32k',
    'gpt-35-turbo',
    'gpt-35-turbo-16k',
    'text-davinci-003'
  ];

  for (const deploymentName of commonDeploymentNames) {
    console.log(`\nTesting deployment name: ${deploymentName}`);
    
    try {
      const chatUrl = `${endpoint}openai/deployments/${deploymentName}/chat/completions?api-version=2024-02-15-preview`;
      
      const response = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'api-key': apiKey!,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 5
        })
      });

      console.log(`  Status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        console.log(`  ✅ SUCCESS! Deployment '${deploymentName}' exists and works`);
        console.log(`  Update your .env.local: AZURE_OPENAI_DEPLOYMENT_NAME=${deploymentName}`);
        return;
      } else if (response.status !== 404) {
        const errorText = await response.text();
        console.log(`  ⚠️  Deployment exists but failed: ${errorText.substring(0, 100)}...`);
      } else {
        console.log(`  ❌ Deployment '${deploymentName}' not found (404)`);
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  console.log('\n=== Summary ===');
  console.log('❌ No working deployments found.');
  console.log('This suggests that:');
  console.log('1. No models have been deployed to this Azure OpenAI resource');
  console.log('2. The API key may not have the correct permissions');
  console.log('3. The endpoint URL may be incorrect');
  console.log('\nPlease check your Azure OpenAI resource in the Azure portal and ensure:');
  console.log('- Models are deployed');
  console.log('- API keys have the correct permissions');
  console.log('- The endpoint URL is correct');
}

fixAzureEndpoint().catch(console.error);