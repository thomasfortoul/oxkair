#!/usr/bin/env node

/**
 * Check what deployments are available on the Azure OpenAI endpoint
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

async function checkAvailableDeployments() {
  console.log('=== Checking Available Azure OpenAI Deployments ===\n');

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2025-01-01-preview';

  if (!endpoint || !apiKey) {
    console.error('Missing Azure OpenAI endpoint or API key');
    return;
  }

  console.log('Endpoint:', endpoint);
  console.log('API Version:', apiVersion);
  console.log();

  try {
    // List deployments using Azure OpenAI REST API
    const deploymentsUrl = `${endpoint}openai/deployments?api-version=${apiVersion}`;
    console.log('Fetching deployments from:', deploymentsUrl);

    const response = await fetch(deploymentsUrl, {
      method: 'GET',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error('Failed to fetch deployments:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('Error response:', errorText);
      return;
    }

    const data = await response.json();
    console.log('✅ Successfully fetched deployments');
    console.log('Raw response:', JSON.stringify(data, null, 2));

    if (data.data && Array.isArray(data.data)) {
      console.log('\n=== Available Deployments ===');
      data.data.forEach((deployment: any, index: number) => {
        console.log(`${index + 1}. Deployment ID: ${deployment.id}`);
        console.log(`   Model: ${deployment.model || 'Unknown'}`);
        console.log(`   Status: ${deployment.status || 'Unknown'}`);
        console.log(`   Created: ${deployment.created_at || 'Unknown'}`);
        console.log(`   Scale Type: ${deployment.scale_settings?.scale_type || 'Unknown'}`);
        console.log();
      });

      // Suggest correct deployment names
      console.log('=== Suggested Environment Variable Updates ===');
      const availableDeployments = data.data.map((d: any) => d.id);
      
      if (availableDeployments.length > 0) {
        console.log('Update your .env.local file with one of these deployment names:');
        availableDeployments.forEach((deploymentId: string) => {
          console.log(`AZURE_OPENAI_DEPLOYMENT_NAME=${deploymentId}`);
        });
      } else {
        console.log('No deployments found. You may need to create deployments in Azure OpenAI Studio.');
      }
    } else {
      console.log('Unexpected response format:', data);
    }

  } catch (error) {
    console.error('❌ Error checking deployments:', error);
  }

  // Also check the second endpoint if configured
  const endpoint2 = process.env.AZURE_OPENAI_ENDPOINT_2;
  const apiKey2 = process.env.AZURE_OPENAI_API_KEY_2;

  if (endpoint2 && apiKey2) {
    console.log('\n=== Checking Second Endpoint ===');
    console.log('Endpoint 2:', endpoint2);

    try {
      const deploymentsUrl2 = `${endpoint2}/openai/deployments?api-version=${apiVersion}`;
      console.log('Fetching deployments from endpoint 2:', deploymentsUrl2);

      const response2 = await fetch(deploymentsUrl2, {
        method: 'GET',
        headers: {
          'api-key': apiKey2,
          'Content-Type': 'application/json'
        }
      });

      if (!response2.ok) {
        console.error('Failed to fetch deployments from endpoint 2:', response2.status, response2.statusText);
        return;
      }

      const data2 = await response2.json();
      console.log('✅ Successfully fetched deployments from endpoint 2');
      
      if (data2.data && Array.isArray(data2.data)) {
        console.log('\n=== Available Deployments (Endpoint 2) ===');
        data2.data.forEach((deployment: any, index: number) => {
          console.log(`${index + 1}. Deployment ID: ${deployment.id}`);
          console.log(`   Model: ${deployment.model || 'Unknown'}`);
          console.log(`   Status: ${deployment.status || 'Unknown'}`);
          console.log();
        });
      }

    } catch (error) {
      console.error('❌ Error checking endpoint 2 deployments:', error);
    }
  }
}

checkAvailableDeployments().catch(console.error);