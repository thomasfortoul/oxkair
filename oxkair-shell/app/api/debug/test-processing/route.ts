import { NextRequest, NextResponse } from 'next/server';
import { createDefaultAIModelService } from '@/lib/services/ai-model-service';
import { processCaseWithOrchestrator } from '@/app/coder/lib/orchestratorProcessing';
import { WorkflowLogger } from '@/app/coder/lib/logging';
import type { CaseNotes } from '@/app/coder/lib/ai-workflow-types';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const testCaseId = `debug-test-${Date.now()}`;
  
  console.log(`[DEBUG API] Starting test at ${new Date().toISOString()}`);
  
  const results = {
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL,
      hasAzureKey: !!process.env.AZURE_OPENAI_API_KEY,
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasSupabaseKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    tests: [] as any[],
    totalExecutionTime: 0,
  };

  // Test 1: Environment Variables
  try {
    console.log(`[DEBUG API] Test 1: Environment check`);
    results.tests.push({
      name: 'Environment Variables',
      success: true,
      details: results.environment,
    });
  } catch (error) {
    results.tests.push({
      name: 'Environment Variables',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Test 2: AI Service Connection
  try {
    console.log(`[DEBUG API] Test 2: AI Service connection`);
    const aiService = createDefaultAIModelService();
    const connectionTest = await aiService.testConnection();
    
    results.tests.push({
      name: 'AI Service Connection',
      success: connectionTest.success,
      responseTime: connectionTest.responseTime,
      error: connectionTest.error,
    });
  } catch (error) {
    results.tests.push({
      name: 'AI Service Connection',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Test 3: Simple Text Generation
  try {
    console.log(`[DEBUG API] Test 3: Simple text generation`);
    const aiService = createDefaultAIModelService();
    const textResult = await aiService.generateText('Respond with exactly: "Test successful"');
    
    results.tests.push({
      name: 'Simple Text Generation',
      success: true,
      result: textResult,
    });
  } catch (error) {
    results.tests.push({
      name: 'Simple Text Generation',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Test 4: Minimal Orchestrator Test (with timeout)
  try {
    console.log(`[DEBUG API] Test 4: Minimal orchestrator test`);
    
    const logger = new WorkflowLogger(testCaseId);
    const testCaseNotes: CaseNotes = {
      primaryNoteText: 'PROCEDURE: Test procedure for debugging. DIAGNOSIS: Test diagnosis.',
      additionalNotes: [],
    };
    
    const testCaseMeta = {
      caseId: testCaseId,
      patientId: 'debug-patient',
      providerId: 'debug-provider',
      dateOfService: new Date(),
      claimType: 'primary' as const,
      status: 'processing' as const,
    };

    // Set a shorter timeout for testing
    const orchestratorPromise = processCaseWithOrchestrator(
      testCaseNotes,
      testCaseMeta,
      logger,
      (progress) => {
        console.log(`[DEBUG API] Progress: ${progress.step} (${progress.progress}%)`);
      },
      { priorityLevel: 'low' }
    );

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Test timeout after 30 seconds')), 30000);
    });

    const orchestratorResult: any = await Promise.race([orchestratorPromise, timeoutPromise]);
    
    results.tests.push({
      name: 'Minimal Orchestrator Test',
      success: orchestratorResult.success,
      error: orchestratorResult.error,
      executionTime: Date.now() - startTime,
    });

    await logger.close();
    
  } catch (error) {
    results.tests.push({
      name: 'Minimal Orchestrator Test',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      executionTime: Date.now() - startTime,
    });
  }

  results.totalExecutionTime = Date.now() - startTime;
  
  console.log(`[DEBUG API] All tests completed in ${results.totalExecutionTime}ms`);
  
  return NextResponse.json(results, { 
    status: 200,
    headers: {
      'Cache-Control': 'no-cache',
    }
  });
}

export const maxDuration = 60; // Set max duration to 60 seconds for Pro plan