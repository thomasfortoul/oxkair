#!/usr/bin/env node

/**
 * Debug script to check Azure OpenAI configuration
 */

import { loadSimpleBackendConfig, validateBackendConfig } from './lib/config/azure-backend-simple.ts';
import { SimpleBackendManager } from './lib/services/simple-backend-manager.ts';

async function debugAzureConfig() {
  console.log('=== Azure OpenAI Configuration Debug ===\n');

  // Check environment variables
  console.log('Environment Variables:');
  console.log('AZURE_OPENAI_ENDPOINT:', process.env.AZURE_OPENAI_ENDPOINT ? 'SET' : 'NOT SET');
  console.log('AZURE_OPENAI_API_KEY:', process.env.AZURE_OPENAI_API_KEY ? 'SET (length: ' + process.env.AZURE_OPENAI_API_KEY.length + ')' : 'NOT SET');
  console.log('AZURE_OPENAI_DEPLOYMENT_NAME:', process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'NOT SET');
  console.log('AZURE_OPENAI_API_VERSION:', process.env.AZURE_OPENAI_API_VERSION || 'NOT SET');
  console.log('AZURE_OPENAI_ENDPOINT_2:', process.env.AZURE_OPENAI_ENDPOINT_2 ? 'SET' : 'NOT SET');
  console.log('AZURE_OPENAI_API_KEY_2:', process.env.AZURE_OPENAI_API_KEY_2 ? 'SET (length: ' + process.env.AZURE_OPENAI_API_KEY_2.length + ')' : 'NOT SET');
  console.log();

  // Check backend configuration
  try {
    console.log('Loading backend configuration...');
    const config = loadSimpleBackendConfig();
    console.log('Backend config loaded successfully');
    console.log('Endpoint A URL:', config.endpointA.url);
    console.log('Endpoint B URL:', config.endpointB.url);
    console.log('Endpoint A has API key:', !!config.endpointA.apiKey);
    console.log('Endpoint B has API key:', !!config.endpointB.apiKey);
    console.log();

    // Validate configuration
    console.log('Validating backend configuration...');
    const validation = validateBackendConfig(config);
    console.log('Validation result:', validation.valid ? 'VALID' : 'INVALID');
    if (!validation.valid) {
      console.log('Validation errors:', validation.errors);
    }
    console.log();

    // Test backend manager initialization
    console.log('Testing SimpleBackendManager initialization...');
    const backendManager = new SimpleBackendManager();
    console.log('SimpleBackendManager initialized successfully');
    
    const configInfo = backendManager.getConfigInfo();
    console.log('Config info:', configInfo);
    console.log();

    // Test agent assignment
    console.log('Testing agent assignment for cpt_agent...');
    const assignment = backendManager.getAssignedBackend('cpt_agent');
    console.log('Assignment result:', {
      endpoint: assignment.endpoint,
      deployment: assignment.deployment,
      endpointUrl: assignment.endpointUrl
    });

  } catch (error) {
    console.error('Error during configuration check:', error);
  }
}

debugAzureConfig().catch(console.error);