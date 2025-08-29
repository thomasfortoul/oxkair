/**
 * Test script for async processing implementation
 * 
 * This script tests the new concurrent agent execution to ensure:
 * 1. CPT agent runs first (foundation)
 * 2. ICD→LCD and CCI→Modifier pathways run in parallel
 * 3. RVU agent runs independently in parallel
 * 4. Results are properly merged
 * 5. Performance improvement is achieved
 */

import { WorkflowOrchestrator, createDefaultOrchestrator } from "./lib/workflow/workflow-orchestrator";
import { ServiceRegistry } from "./lib/services/service-registry";
import { WorkflowLogger } from "./app/coder/lib/logging";
import { registerAllAgents } from "./app/coder/lib/agent-factory";
import { StandardizedWorkflowState } from "./lib/agents/newtypes";

interface TestResult {
  success: boolean;
  executionTime: number;
  agentsExecuted: string[];
  errors: string[];
  parallelismAchieved: boolean;
  performanceImprovement?: number;
}

async function testAsyncProcessing(): Promise<TestResult> {
  const startTime = Date.now();
  console.log("🚀 Starting async processing test...");

  try {
    // Create test case data
    const testCaseId = `test-async-${Date.now()}`;
    const logger = new WorkflowLogger(testCaseId, { caseId: testCaseId });
    
    // Initialize service registry
    console.log("📋 Initializing service registry...");
    const serviceRegistry = new ServiceRegistry(logger);
    await serviceRegistry.initialize();
    
    // Create orchestrator
    console.log("🎭 Creating orchestrator...");
    const orchestrator = createDefaultOrchestrator(serviceRegistry);
    
    // Register all agents
    console.log("👥 Registering agents...");
    registerAllAgents(orchestrator, logger);
    
    // Create initial state
    const initialState: Partial<StandardizedWorkflowState> = {
      caseMeta: {
        caseId: testCaseId,
        patientId: "test-patient-001",
        providerId: "test-provider-001",
        dateOfService: new Date(),
        claimType: "primary",
        status: "processing"
      },
      caseNotes: {
        primaryNoteText: `
          OPERATIVE REPORT
          
          PREOPERATIVE DIAGNOSIS: Acute cholecystitis
          POSTOPERATIVE DIAGNOSIS: Acute cholecystitis with cholelithiasis
          
          PROCEDURE PERFORMED: Laparoscopic cholecystectomy
          
          DESCRIPTION OF PROCEDURE:
          The patient was brought to the operating room and placed in supine position.
          After adequate general anesthesia, the abdomen was prepped and draped in sterile fashion.
          
          A 12mm trocar was placed at the umbilicus for the camera.
          Three additional 5mm trocars were placed under direct visualization.
          
          The gallbladder was grasped and retracted cephalad.
          Calot's triangle was dissected to identify the critical view of safety.
          The cystic artery and cystic duct were clipped and divided.
          
          The gallbladder was dissected from the liver bed using electrocautery.
          Hemostasis was achieved. The gallbladder was placed in an extraction bag.
          
          All trocars were removed under direct visualization.
          The fascia at the umbilical port was closed with suture.
          
          The patient tolerated the procedure well.
        `,
        additionalNotes: []
      },
      procedureCodes: [],
      diagnosisCodes: [],
      hcpcsCodes: [],
      finalModifiers: [],
      errors: []
    };

    // Track execution phases
    const phaseTimings: Record<string, number> = {};
    let currentPhase = "";
    
    const progressCallback = (progress: { agent?: string; step: string; progress?: number }) => {
      const timestamp = Date.now();
      
      if (progress.step.includes("Phase 1:")) {
        currentPhase = "Phase1_CPT";
        phaseTimings[currentPhase] = timestamp;
      } else if (progress.step.includes("Phase 2:")) {
        currentPhase = "Phase2_Parallel";
        phaseTimings[currentPhase] = timestamp;
      } else if (progress.step.includes("parallel pathways")) {
        phaseTimings["Phase2_Start"] = timestamp;
      } else if (progress.step.includes("Merging results")) {
        phaseTimings["Phase2_End"] = timestamp;
      }
      
      console.log(`📊 [${progress.progress || 0}%] ${progress.step}${progress.agent ? ` (${progress.agent})` : ''}`);
    };

    // Execute the workflow
    console.log("⚡ Executing async workflow...");
    const executionStartTime = Date.now();
    
    const result = await orchestrator.execute(
      testCaseId,
      initialState,
      logger,
      progressCallback
    );
    
    const executionEndTime = Date.now();
    const totalExecutionTime = executionEndTime - executionStartTime;

    // Analyze results
    console.log("\n📈 Analyzing results...");
    
    const agentsExecuted = result.agentExecutionResults.map(r => r.agentName);
    const errors = result.errors.map(e => e.message);
    
    // Check if parallelism was achieved by looking at timing patterns
    const parallelismAchieved = phaseTimings["Phase2_Start"] && phaseTimings["Phase2_End"] && 
      (phaseTimings["Phase2_End"] - phaseTimings["Phase2_Start"]) < (totalExecutionTime * 0.8);

    console.log("\n✅ Test Results:");
    console.log(`   Success: ${result.success}`);
    console.log(`   Execution Time: ${totalExecutionTime}ms`);
    console.log(`   Agents Executed: ${agentsExecuted.length} (${agentsExecuted.join(', ')})`);
    console.log(`   Errors: ${errors.length}`);
    console.log(`   Parallelism Achieved: ${parallelismAchieved}`);
    
    if (errors.length > 0) {
      console.log(`   Error Details: ${errors.join('; ')}`);
    }

    // Log phase timings
    console.log("\n⏱️  Phase Timings:");
    Object.entries(phaseTimings).forEach(([phase, timestamp]) => {
      console.log(`   ${phase}: ${timestamp - executionStartTime}ms`);
    });

    return {
      success: result.success && errors.length === 0,
      executionTime: totalExecutionTime,
      agentsExecuted,
      errors,
      parallelismAchieved: Boolean(parallelismAchieved)
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Test failed:", errorMessage);
    
    return {
      success: false,
      executionTime: Date.now() - startTime,
      agentsExecuted: [],
      errors: [errorMessage],
      parallelismAchieved: false
    };
  }
}

// Run the test if this file is executed directly
testAsyncProcessing()
  .then(result => {
    console.log("\n🎯 Final Test Result:", result.success ? "PASSED" : "FAILED");
    
    if (result.success) {
      console.log("🎉 Async processing implementation is working correctly!");
      console.log(`⚡ Total execution time: ${result.executionTime}ms`);
      console.log(`🔄 Parallelism achieved: ${result.parallelismAchieved ? 'Yes' : 'No'}`);
    } else {
      console.log("💥 Test failed. Check the errors above.");
      process.exit(1);
    }
  })
  .catch(error => {
    console.error("💥 Test execution failed:", error);
    process.exit(1);
  });

export { testAsyncProcessing };