#!/usr/bin/env tsx
/**
 * Database-Bypass Testing Suite for Medical Note Processing
 * 
 * This version bypasses the database loading step and directly processes
 * the operative note content through the orchestrator pipeline.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { v4 as uuidv4 } from 'uuid';

// Import the core processing functions
import { processCaseWithOrchestrator } from './app/coder/lib/orchestratorProcessing';
import { WorkflowLogger } from './app/coder/lib/logging';
import type { CaseNotes } from './app/coder/lib/ai-workflow-types';
import type { CaseMeta } from './lib/agents/newtypes';
import type { ProcessingOptions, ProgressCallback } from './app/coder/lib/orchestratorProcessing';

// Types for our test configuration
interface TestConfig {
  // Required fields from case form
  mrn: string;
  dateOfService: string;
  insuranceProvider: string;
  
  // Optional demographics
  patientName?: string;
  providerName?: string;
  department?: string;
  team?: string;
  assistantSurgeon?: string;
  residentPresence?: string;
  dischargeDate?: string;
  
  // Processing options
  userRole?: "coder" | "provider" | "admin";
  priorityLevel?: "low" | "normal" | "high";
  enableDetailedLogging?: boolean;
  
  // Note configuration
  billableNotes?: string[];
  additionalNotes?: {
    admission?: string;
    discharge?: string;
    pathology?: string;
    progress?: string;
    bedside?: string;
  };
}

interface TestResult {
  success: boolean;
  caseId: string;
  executionTime: number;
  processingResult?: any;
  error?: string;
  logs: string[];
  metadata?: any;
}

class DirectProcessingTester {
  private logs: string[] = [];
  private startTime: number = 0;
  
  constructor() {
    this.log('Direct Processing Testing Suite Initialized');
  }
  
  private log(message: string, level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    this.logs.push(logMessage);
    console.log(logMessage);
  }
  
  /**
   * Load and validate the note file
   */
  private loadNoteFile(notePath: string): string {
    this.log(`Loading note file: ${notePath}`);
    
    if (!existsSync(notePath)) {
      throw new Error(`Note file not found: ${notePath}`);
    }
    
    const noteContent = readFileSync(notePath, 'utf-8');
    
    if (!noteContent.trim()) {
      throw new Error('Note file is empty');
    }
    
    this.log(`Note file loaded successfully (${noteContent.length} characters)`);
    return noteContent;
  }
  
  /**
   * Load and validate the configuration
   */
  private loadConfig(configPath: string): TestConfig {
    this.log(`Loading configuration: ${configPath}`);
    
    if (!existsSync(configPath)) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }
    
    const configContent = readFileSync(configPath, 'utf-8');
    let config: TestConfig;
    
    try {
      config = JSON.parse(configContent);
    } catch (error) {
      throw new Error(`Invalid JSON in configuration file: ${error}`);
    }
    
    // Validate required fields
    this.validateConfig(config);
    
    this.log('Configuration loaded and validated successfully');
    return config;
  }
  
  /**
   * Validate the configuration has required fields
   */
  private validateConfig(config: TestConfig): void {
    const required = ['mrn', 'dateOfService', 'insuranceProvider'];
    const missing = required.filter(field => !config[field as keyof TestConfig]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required configuration fields: ${missing.join(', ')}`);
    }
    
    // Validate date format
    if (isNaN(Date.parse(config.dateOfService))) {
      throw new Error('dateOfService must be a valid date (YYYY-MM-DD format recommended)');
    }
    
    // Validate MRN is numeric
    if (!/^\d+$/.test(config.mrn)) {
      throw new Error('MRN must be numeric');
    }
  }
  
  /**
   * Transform config to CaseNotes format
   */
  private createCaseNotes(noteContent: string, config: TestConfig): CaseNotes {
    const additionalNotes = [];
    
    if (config.additionalNotes?.admission) {
      additionalNotes.push({ type: 'admission', text: config.additionalNotes.admission });
    }
    if (config.additionalNotes?.discharge) {
      additionalNotes.push({ type: 'discharge', text: config.additionalNotes.discharge });
    }
    if (config.additionalNotes?.pathology) {
      additionalNotes.push({ type: 'pathology', text: config.additionalNotes.pathology });
    }
    if (config.additionalNotes?.progress) {
      additionalNotes.push({ type: 'progress', text: config.additionalNotes.progress });
    }
    if (config.additionalNotes?.bedside) {
      additionalNotes.push({ type: 'bedside', text: config.additionalNotes.bedside });
    }
    
    return {
      primaryNoteText: noteContent,
      additionalNotes
    };
  }
  
  /**
   * Transform config to CaseMeta format
   */
  private createCaseMeta(caseId: string, config: TestConfig): CaseMeta {
    return {
      caseId,
      patientId: config.patientName ? `patient-${config.mrn}` : `patient_${Date.now()}`,
      providerId: config.providerName ? `provider-${Date.now()}` : `provider_${Date.now()}`,
      dateOfService: new Date(config.dateOfService),
      claimType: "primary",
      status: "processing",
    };
  }
  
  /**
   * Run the direct processing test (bypassing database)
   */
  async runDirectTest(notePath: string, configPath: string): Promise<TestResult> {
    this.startTime = Date.now();
    this.log('='.repeat(80));
    this.log('STARTING DIRECT PROCESSING TEST (BYPASSING DATABASE)');
    this.log('='.repeat(80));
    
    try {
      // Load inputs
      const noteContent = this.loadNoteFile(notePath);
      const config = this.loadConfig(configPath);
      
      // Generate case ID
      const caseId = uuidv4();
      this.log(`Generated Case ID: ${caseId}`);
      
      // Prepare data structures
      const caseNotes = this.createCaseNotes(noteContent, config);
      const caseMeta = this.createCaseMeta(caseId, config);
      const userRole = config.userRole || "coder";
      
      this.log('='.repeat(40));
      this.log('TEST CONFIGURATION:');
      this.log(`  Case ID: ${caseId}`);
      this.log(`  MRN: ${config.mrn}`);
      this.log(`  Date of Service: ${config.dateOfService}`);
      this.log(`  Insurance: ${config.insuranceProvider}`);
      this.log(`  User Role: ${userRole}`);
      this.log(`  Priority: ${config.priorityLevel || "normal"}`);
      this.log(`  Note Length: ${noteContent.length} characters`);
      this.log(`  Additional Notes: ${caseNotes.additionalNotes.length} types`);
      this.log('='.repeat(40));
      
      // Mock authentication context for testing
      this.mockAuthContext();
      
      this.log('Starting direct orchestrator processing...');
      
      // Create workflow logger
      const workflowLogger = new WorkflowLogger(caseId);
      
      // Progress callback
      const progressCallback: ProgressCallback = (progress) => {
        this.log(`Progress: ${progress.step} (${progress.progress}%) - Agent: ${progress.agent || 'N/A'}`);
      };
      
      // Processing options
      const processingOptions: ProcessingOptions = {
        priorityLevel: config.priorityLevel || "normal",
        requiredAgents: undefined,
        optionalAgents: undefined,
        timeout: 120000, // 2 minutes timeout for testing
      };
      
      // Call the orchestrator directly
      const processingResult = await processCaseWithOrchestrator(
        caseNotes,
        caseMeta,
        workflowLogger,
        progressCallback,
        processingOptions
      );
      
      const executionTime = Date.now() - this.startTime;
      
      this.log('='.repeat(40));
      this.log('PROCESSING COMPLETED');
      this.log(`  Success: ${processingResult.success}`);
      this.log(`  Execution Time: ${executionTime}ms`);
      this.log(`  Processing Method: direct-orchestrator`);
      this.log('='.repeat(40));
      
      if (processingResult.error) {
        this.log(`Processing Error: ${processingResult.error}`, 'ERROR');
      }
      
      // Save detailed results
      await this.saveResults(caseId, {
        config,
        noteContent,
        caseNotes,
        caseMeta,
        processingResult,
        executionTime,
        logs: this.logs
      });
      
      // Close the workflow logger
      try {
        await workflowLogger.close();
      } catch (closeError) {
        this.log(`Warning: Failed to close workflow logger: ${closeError}`, 'WARN');
      }
      
      return {
        success: processingResult.success,
        caseId,
        executionTime,
        processingResult: processingResult.data,
        error: processingResult.error,
        logs: this.logs,
        metadata: processingResult.metadata
      };
      
    } catch (error) {
      const executionTime = Date.now() - this.startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.log(`Test failed with error: ${errorMessage}`, 'ERROR');
      
      return {
        success: false,
        caseId: 'unknown',
        executionTime,
        error: errorMessage,
        logs: this.logs
      };
    }
  }
  
  /**
   * Mock authentication context for testing
   */
  private mockAuthContext() {
    // Set up minimal environment variables for testing
    if (!process.env.NODE_ENV) {
      (process.env as any).NODE_ENV = 'development';
    }
    
    this.log('Authentication context mocked for testing');
  }
  
  /**
   * Save detailed test results
   */
  private async saveResults(caseId: string, results: any) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Create logs directory if it doesn't exist
    const logsDir = join(process.cwd(), 'logs');
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
      this.log(`Created logs directory: ${logsDir}`);
    }
    
    const filename = join(logsDir, `tmp_rovodev_direct_test_results_${caseId}_${timestamp}.json`);
    
    try {
      writeFileSync(filename, JSON.stringify(results, null, 2));
      this.log(`Detailed results saved to: ${filename}`);
      
      // Run execution time parsing if workflow summary exists
      await this.parseExecutionTimes(filename, caseId);
      
    } catch (error) {
      this.log(`Failed to save results: ${error}`, 'ERROR');
    }
  }

  /**
   * Parse execution times from workflow logs and add to results
   */
  private async parseExecutionTimes(resultsFile: string, caseId: string) {
    try {
      this.log('Parsing execution times from workflow logs...');
      
      // Read the results file to get workflow data
      const resultsData = JSON.parse(readFileSync(resultsFile, 'utf-8'));
      
      // Look for execution trace in the processing result execution summary
      const executionTrace = resultsData.processingResult?.executionSummary?.executionTrace ||
                            resultsData.processingResult?.metadata?.executionTrace ||
                            resultsData.metadata?.executionTrace;
      
      if (!executionTrace || !Array.isArray(executionTrace)) {
        this.log('No workflow execution trace found in results');
        return;
      }
      
      // Parse execution traces from the actual log structure
      const executionTraces = this.parseExecutionTraces(executionTrace);
      
      if (executionTraces.length === 0) {
        this.log('No execution time entries found in workflow trace');
        return;
      }
      
      // Add execution analysis to results
      resultsData.executionAnalysis = {
        chronological: executionTraces.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
        byDuration: executionTraces.sort((a, b) => b.duration - a.duration),
        totalSteps: executionTraces.length,
        totalExecutionTime: executionTraces.reduce((sum, trace) => sum + trace.duration, 0)
      };
      
      // Write updated results back
      writeFileSync(resultsFile, JSON.stringify(resultsData, null, 2));
      
      // Log the execution analysis
      this.logExecutionAnalysis(executionTraces);
      
    } catch (error) {
      this.log(`Failed to parse execution times: ${error}`, 'WARN');
    }
  }

  /**
   * Parse execution traces from execution trace array (integrated Python logic)
   */
  private parseExecutionTraces(executionTrace: any[]): Array<{
    timestamp: string;
    component: string;
    stepId: string;
    duration: number;
  }> {
    const entries: Array<{
      timestamp: string;
      component: string;
      stepId: string;
      duration: number;
    }> = [];
    
    for (const trace of executionTrace) {
      // Only process api_call_end entries that have execution time
      if (trace.type !== 'api_call_end') {
        continue;
      }
      
      const meta = trace.metadata || {};
      const execTime = meta.executionTime;
      
      if (execTime === null || execTime === undefined) {
        continue;
      }
      
      const ts = trace.timestamp;
      let tsIso: string;
      
      try {
        // Convert ms timestamp to ISO
        tsIso = new Date(ts).toISOString();
      } catch (error) {
        tsIso = String(ts);
      }
      
      entries.push({
        timestamp: tsIso,
        component: trace.component || 'unknown',
        stepId: trace.stepId || '',
        duration: execTime
      });
    }
    
    return entries;
  }

  /**
   * Log execution analysis results
   */
  private logExecutionAnalysis(traces: Array<{
    timestamp: string;
    component: string;
    stepId: string;
    duration: number;
  }>) {
    this.log('='.repeat(60));
    this.log('EXECUTION TIME ANALYSIS');
    this.log('='.repeat(60));
    
    // Chronological execution traces
    const chronological = traces.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    this.log('Chronological execution traces with durations:');
    for (const trace of chronological) {
      this.log(`  ${trace.component} (${trace.stepId}): ${trace.duration}ms`);
    }
    
    this.log('');
    
    // Top longest executions
    const byDuration = traces.sort((a, b) => b.duration - a.duration);
    this.log('Longest execution times:');
    for (const trace of byDuration) {
      this.log(`  ${trace.duration}ms - ${trace.component} - (${trace.stepId})`);
    }
    
    // Summary statistics
    const totalTime = traces.reduce((sum, trace) => sum + trace.duration, 0);
    const avgTime = totalTime / traces.length;
    const maxTime = Math.max(...traces.map(t => t.duration));
    const minTime = Math.min(...traces.map(t => t.duration));
    
    this.log('');
    this.log('Summary Statistics:');
    this.log(`  Total Steps: ${traces.length}`);
    this.log(`  Total Execution Time: ${totalTime}ms`);
    this.log(`  Average Step Time: ${avgTime.toFixed(2)}ms`);
    this.log(`  Longest Step: ${maxTime}ms`);
    this.log(`  Shortest Step: ${minTime}ms`);
    this.log('='.repeat(60));
  }
  
  /**
   * Run test with inline configuration (bypassing database)
   */
  async runInlineDirectTest(): Promise<TestResult> {
    this.log('Running inline direct test with sample data...');
    
    // Create sample note content
    const sampleNote2 = `PREOPERATIVE DIAGNOSIS:
Massive recurrent ventral incisional hernia 
 
POSTOPERATIVE DIAGNOSIS:
Massive incarcerated recurrent ventral incisional hernia measuring 15 x 30 cm M2 through M4.
 
PROCEDURES:
1. 1.	Exploratory laparotomy with lysis of adhesiosn 
2. 2.	Excisional debridement of nonviable muscle and fascia of abdominal wall including infected mesh, suture, and tacks 
3. 3.	Ventral incisional hernia repair with bridging Phasix ST mesh 10x4cm
4. 4.	Disposable negative pressure wound therapy placement 50cm2.
 
ANESTHESIA:
General endotracheal, local.
 
ESTIMATED BLOOD LOSS:
200.
 
COMPLICATIONS:
None apparent.
 
SPECIMENS:
Excisional debridement and surgical foreign body
 
Edwin Raymond Pynenberg is a 69 year old male with a symptomatic recurrent massive ventral incisional hernia and recurrent metastatic colon cancer of the liver. He was scheduled for resection of the liver mets and I was asked to assist with entry and closure given the complex abdominal wall.  All risks and benefits were discussed with the patient and operative consent was obtained.
 
The patient was taken to the OR and transferred to the OR table in supine position. A preop time-out was performed and all were in agreement. Patient received preoperative antibiotics and heparin. SCDs were placed. General endotracheal anesthesia was induced. A Foley catheter was placed. We began with an upper abdominal midline laparotomy and entered the abdomen safely. We encountered the hernia sac. We incised this. We encountered dense omental adhesions. We performed an extensive adhesiolysis. Of note modifier 22 should be added for complexity of the case due to the multiple recurrent hernias, and patient body habitus, all of which increased operative difficulty. 
 
Once we had taken down the midline we performed a complete intraabdominal adhesiolysis. Once we performed that, we performed excisional debridement of nonviable muscle, fascia, subcutaneous tissue and hernia sac.  There was one full-thickness enterotomy which was repaired with 3-0 vicryl sutures transversely.  This was inherent with the complexity of the case. I then turned the case over to Dr. Weber for her portion of the case.  
 
After Dr. Weber's portion I then assumed control of the case.  All counts were reported correct. We then debrided the old surgical foreign body and nonviable muscle and fascia until we got back to healthy tissue. We were then left with the abdominal wall and healthy native fascia.  We then took our healthy anterior fascial edges bilaterally and closed with interrupted figure-of-eight #1 PDS sutures. This brought the fascia together nicely without significant tension except for a small 10x2cm area in the M3 zone where I felt the tension would be too great for a durable closure.  We chose to suture in a bridge of Phasix ST mesh with the coated side against the viscera.  We used #1 Prolene to suture this in circumferentially. We then irrigated with 2L irrisept  and then washed with saline.  We placed a drain in the subq space and then closed the skin with staples with disposable NPWT over the top.  
 
I was present and scrubbed for the duration of the case. All counts were reported as correct to me at the completion of the case.
`;
    const sampleNote = `PROCEDURE:
1. Laparoscopic takedown gastrocutaneous fistula
2. Laparoscopic gastrostomy tube placement

SURGEON: Amber L Shada, MD
ASSISTANT: Yousif Hanna, MD resident
ANESTHESIOLOGIST: Anesthesiologist: Karl Willmann, MD
Clinical Anesthetist: Damein M Burgess, CRNA
ANESTHESIA: General endotracheal anesthesia.
ESTIMATED BLOOD LOSS: Less than 25 mL
INDICATIONS: Patient is a 25 year old male who underwent lap J tube last week for feeding access in setting of gastrocutaneous fistula. Dilation of the colon precluded access to the stomach and we returned today for gastrocutaneous fistula management. Laparoscopic takedown and resiting was advised and, after discussing the risks and benefits of surgery, the patient agreed to proceed with surgical intervention. Of note, the patient requires high volumes of fluid infused and his mother preferred he keep a G tube for this purpose rather than use the PICC that he had been using.

SUMMARY OF FINDINGS:
The colon was smaller than prior allowing visualization of the stomach and takedown of the fistula site. A new 16 french gastrostomy tube was placed distal to the prior tube, in the midline of the upper abdomen. The existing jejunostomy tube was left in place.

DESCRIPTION OF PROCEDURE:
The patient was taken to the operating room, placed in supine position on the operating room table. General endotracheal anesthesia was obtained. The abdomen was prepped and draped in the usual fashion. A timeout was called. The abdomen was entered using a Veress needle technique through a supraumbilical horizontal skin incision. Pneumoperitoneum was established and the Veress needle was exchanged for a 5 mm trocar. The laparoscope was inserted and 3 additional trocars were placed under direct visualization following the instillation of 0.25 percent Marcaine with epinephrine.

The transverse colon was swept down from the upper midline to expose the gastrostomy tube site. The site was taken down with harmonic scalpel. The site was closed with a running 3-0 absorbable barbed suture. Endoscopic leak test was negative for leak. A combination of blunt and ultrasonic dissection was used to mobilize the stomach off of the anterior abdominal wall and left lobe of the liver to allow placement of a new gastrostomy tube. Endoscopic Inflation of the stomach with the endoscope was used to distend the stomach and find a location (distal to the prior tube site) to pexy stomach to anterior abdominal wall in the midline. This gastropexy was accomplished with a 2-0 absorbable barbed suture. Using a percutaneous method, the stomach was accessed with a needle and air insufflation test used to confirm intraluminal gastric placement. A wire was placed through the needle and over a wire a 20french dilator was inserted. The 16 french gastrostomy tube was inserted through the dilator and peel away sheath removed. The balloon was inflated with 5mL of water.

Repeat endoscopy was performed. The balloon was visualized within the gastric lumen along the anterior wall of the stomach proximal to the pylorus. The gastroscope was then removed. The abdomen was inspected for hemostasis and foreign body, which was adequate. All sponge and needle counts were correct. The trocars were subsequently removed under direct vision. The fascia at the 10mm trocar was re-approximated using 0 absorbable suture. The skin was closed with subcuticular absorbable suture and skin adhesive.

The patient tolerated the procedure well. The patient was then extubated and transported to recovery in stable condition.

Specimens: * No specimens in log *

Drains none`;
    
    // Create sample configuration
    const sampleConfig: TestConfig = {
      mrn: "123456789",
      dateOfService: "2024-01-15",
      insuranceProvider: "Medicare",
      patientName: "John Doe",
      providerName: "Dr. Smith",
      department: "Surgery",
      team: "General Surgery",
      userRole: "coder",
      priorityLevel: "normal",
      enableDetailedLogging: true,
      billableNotes: ["operative_notes"]
    };
    
    // Save temporary files
    const noteFile = 'tmp_rovodev_direct_sample_note.md';
    const configFile = 'tmp_rovodev_direct_sample_config.json';
    
    writeFileSync(noteFile, sampleNote);
    writeFileSync(configFile, JSON.stringify(sampleConfig, null, 2));
    
    this.log(`Created sample note file: ${noteFile}`);
    this.log(`Created sample config file: ${configFile}`);
    
    try {
      return await this.runDirectTest(noteFile, configFile);
    } finally {
      // Cleanup temporary files
      try {
        if (existsSync(noteFile)) {
          require('fs').unlinkSync(noteFile);
          this.log(`Cleaned up: ${noteFile}`);
        }
        if (existsSync(configFile)) {
          require('fs').unlinkSync(configFile);
          this.log(`Cleaned up: ${configFile}`);
        }
      } catch (cleanupError) {
        this.log(`Cleanup warning: ${cleanupError}`, 'WARN');
      }
    }
  }
}

/**
 * Main execution function
 */
async function main() {
  const args = process.argv.slice(2);
  const tester = new DirectProcessingTester();
  
  try {
    if (args.includes('--inline')) {
      console.log('Running inline direct test with sample data...');
      const result = await tester.runInlineDirectTest();
      
      console.log('\n' + '='.repeat(80));
      console.log('DIRECT TEST SUMMARY');
      console.log('='.repeat(80));
      console.log(`Success: ${result.success}`);
      console.log(`Case ID: ${result.caseId}`);
      console.log(`Execution Time: ${result.executionTime}ms`);
      if (result.error) {
        console.log(`Error: ${result.error}`);
      }
      console.log('='.repeat(80));
      
      process.exit(result.success ? 0 : 1);
    }
    
    // Parse command line arguments
    const noteArg = args.find(arg => arg.startsWith('--note='));
    const configArg = args.find(arg => arg.startsWith('--config='));
    
    if (!noteArg || !configArg) {
      console.log(`
Usage:
  npx tsx tmp_rovodev_bypass_db_test.ts --note=<note-file.md> --config=<config.json>
  npx tsx tmp_rovodev_bypass_db_test.ts --inline

Examples:
  npx tsx tmp_rovodev_bypass_db_test.ts --note=sample-operative-note.md --config=test-config.json
  npx tsx tmp_rovodev_bypass_db_test.ts --inline

This version bypasses database loading and directly processes the note content.
      `);
      process.exit(1);
    }
    
    const notePath = noteArg.split('=')[1];
    const configPath = configArg.split('=')[1];
    
    console.log(`Testing with note: ${notePath}`);
    console.log(`Testing with config: ${configPath}`);
    
    const result = await tester.runDirectTest(notePath, configPath);
    
    console.log('\n' + '='.repeat(80));
    console.log('DIRECT TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`Success: ${result.success}`);
    console.log(`Case ID: ${result.caseId}`);
    console.log(`Execution Time: ${result.executionTime}ms`);
    if (result.error) {
      console.log(`Error: ${result.error}`);
    }
    console.log('='.repeat(80));
    
    process.exit(result.success ? 0 : 1);
    
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { DirectProcessingTester };
export type { TestConfig, TestResult };