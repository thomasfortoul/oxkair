#!/usr/bin/env tsx

/**
 * Environment Variable Validation Script
 * 
 * This script validates that all required environment variables are present
 * for the AI processing workflow to function correctly.
 */

const REQUIRED_ENV_VARS = [
  'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_ENDPOINT', 
  'AZURE_OPENAI_DEPLOYMENT_NAME',
  'AZURE_OPENAI_API_VERSION',
];

const OPTIONAL_ENV_VARS = [
  'OPENAI_API_KEY',
  'AZURE_SAS_URL',
  'AZURE_URL'
];

function validateEnvironment() {
  console.log('🔍 Validating environment variables...\n');
  
  let hasErrors = false;
  
  // Check required variables
  console.log('📋 Required Variables:');
  for (const envVar of REQUIRED_ENV_VARS) {
    const value = process.env[envVar];
    if (!value) {
      console.log(`❌ ${envVar}: MISSING`);
      hasErrors = true;
    } else {
      const displayValue = envVar.includes('KEY') || envVar.includes('SECRET') 
        ? `${value.substring(0, 8)}...` 
        : value.length > 50 
        ? `${value.substring(0, 47)}...`
        : value;
      console.log(`✅ ${envVar}: ${displayValue}`);
    }
  }
  
  console.log('\n📋 Optional Variables:');
  for (const envVar of OPTIONAL_ENV_VARS) {
    const value = process.env[envVar];
    if (!value) {
      console.log(`⚠️  ${envVar}: NOT SET`);
    } else {
      const displayValue = envVar.includes('KEY') || envVar.includes('SECRET') 
        ? `${value.substring(0, 8)}...` 
        : value.length > 50 
        ? `${value.substring(0, 47)}...`
        : value;
      console.log(`✅ ${envVar}: ${displayValue}`);
    }
  }
  
  console.log('\n🌍 Environment Info:');
  console.log(`✅ NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ VERCEL: ${process.env.VERCEL || 'false'}`);
  
  if (hasErrors) {
    console.log('\n❌ Environment validation failed! Missing required variables.');
    console.log('\n💡 To fix this:');
    console.log('1. For local development: Add missing variables to .env.local');
    console.log('2. For Vercel deployment: Add variables in Vercel Dashboard > Settings > Environment Variables');
    process.exit(1);
  } else {
    console.log('\n✅ Environment validation passed! All required variables are present.');
  }
}

// Test AI service connection if environment is valid
async function testAIConnection() {
  try {
    console.log('\n🤖 Testing AI service connection...');
    
    const { AIModelService } = await import('../lib/services/ai-model-service.ts');
    const aiService = new AIModelService();
    
    const result = await aiService.testConnection();
    
    if (result.success) {
      console.log(`✅ AI service connection successful (${result.responseTime}ms)`);
    } else {
      console.log(`❌ AI service connection failed: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.log(`❌ AI service test error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

async function main() {
  validateEnvironment();
  await testAIConnection();
  console.log('\n🎉 All validations passed! The system should work correctly.');
}

if (require.main === module) {
  main().catch(console.error);
}