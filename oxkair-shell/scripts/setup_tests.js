#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

/**
 * Automated Case Testing Setup Script
 * 
 * This script processes coded_cases.csv and cases.txt to generate
 * structured test cases for automated medical coding validation.
 */

class TestCaseGenerator {
  constructor() {
    this.csvData = new Map();
    this.testCasesDir = 'testing';
  }

  async run() {
    console.log('🚀 Starting test case generation...');
    
    try {
      // Step 1: Parse CSV data
      await this.parseCsvData();
      
      // Step 2: Setup test cases directory
      this.setupTestDirectory();
      
      // Step 3: Generate AI prompt for cases.txt parsing
      this.generateCasesParsingPrompt();
      
      console.log('✅ Test case setup completed successfully!');
      console.log('\nNext steps:');
      console.log('1. Use the generated Gemini Flash prompt to parse cases.txt');
      console.log('2. Save the AI output as parsed_cases.json');
      console.log('3. Run this script again with --generate-files flag');
      
    } catch (error) {
      console.error('❌ Error during setup:', error.message);
      process.exit(1);
    }
  }

  async parseCsvData() {
    console.log('📊 Parsing coded_cases.csv...');
    
    try {
      const csvContent = fs.readFileSync('../coded_cases.csv', 'utf8');
      const parsed = Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true
      });
      
      // Process CSV data
      parsed.data.forEach(row => {
        const caseNum = row['Case #'];
        if (caseNum) {
          // Extract just the number from "Case X" format
          const caseNumber = caseNum.replace('Case ', '');
          this.csvData.set(caseNumber, this.processCsvRow(row));
        }
      });
      
      console.log(`✅ Processed ${this.csvData.size} cases from CSV`);
    } catch (error) {
      throw new Error(`Failed to parse CSV: ${error.message}`);
    }
  }

  processCsvRow(row) {
    const processedRow = {
      mrn: row['MRN'] || '',
      dos: row['DOS'] || '',
      procedureCodes: [],
      diagnosisCodes: []
    };

    // Extract CPT codes and modifiers
    for (let i = 1; i <= 10; i++) {
      let cptKey, modifierKey;
      
      if (i === 1) {
        cptKey = 'CPT1';
        modifierKey = 'Modifer1';
      } else if (i === 2) {
        cptKey = 'CPT 2';
        modifierKey = 'Modifer 2';
      } else if (i === 3) {
        cptKey = 'CPT3';
        modifierKey = 'Modifer 3';
      } else if (i === 4) {
        cptKey = 'CPT4';
        modifierKey = 'Modifer4';
      } else {
        cptKey = `CPT${i}`;
        modifierKey = `Modifer${i}`;
      }
      
      const cptCode = row[cptKey];
      if (cptCode && cptCode.trim()) {
        const modifier = row[modifierKey] || '';
        processedRow.procedureCodes.push({
          code: cptCode.trim(),
          modifier: modifier.trim()
        });
      }
    }

    // Extract ICD codes
    for (let i = 1; i <= 10; i++) {
      let icdKey;
      
      if (i === 1) {
        icdKey = 'ICD1';
      } else if (i === 2) {
        icdKey = 'ICD 2';
      } else if (i === 3) {
        icdKey = 'ICD 3';
      } else {
        icdKey = `ICD${i}`;
      }
      
      const icdCode = row[icdKey];
      
      if (icdCode && icdCode.trim()) {
        processedRow.diagnosisCodes.push({
          code: icdCode.trim()
        });
      }
    }

    return processedRow;
  }

  setupTestDirectory() {
    console.log('📁 Setting up test cases directory...');
    
    // Ensure testing directory exists
    if (!fs.existsSync(this.testCasesDir)) {
      fs.mkdirSync(this.testCasesDir, { recursive: true });
    }
    
    console.log('✅ Test cases directory ready');
  }

  generateCasesParsingPrompt() {
    console.log('🤖 Generating AI parsing prompt...');
    
    const prompt = `# Medical Case Narrative Parsing Task

Please parse the attached cases.txt file and extract structured data for each case. The file contains multiple medical case narratives, each starting with "Case X" where X is a number.

For each case, extract:
1. **Case Number**: The case identifier (e.g., "1", "2", etc.)
2. **Staff/Provider Name**: Usually mentioned early in the narrative
3. **Raw Narrative**: The complete case text EXCLUDING the "CPT CODES:" section and everything after it

## Expected Output Format

Return a JSON object with this structure:

\`\`\`json
{
  "cases": [
    {
      "caseNumber": "1",
      "staff": "Dr. Smith",
      "rawNarrative": "Patient presents with..."
    },
    {
      "caseNumber": "2", 
      "staff": "Dr. Johnson",
      "rawNarrative": "45-year-old male with..."
    }
  ]
}
\`\`\`

## Important Notes:
- Stop the narrative extraction at "CPT CODES:" - do not include coding information
- Preserve all medical details, dates, and clinical information in the raw narrative
- Extract the provider/staff name accurately
- Ensure case numbers match exactly

Please process the entire cases.txt file and return the structured JSON.`;

    // Save prompt to file
    fs.writeFileSync('gemini_parsing_prompt.txt', prompt);
    
    console.log('✅ AI parsing prompt saved to gemini_parsing_prompt.txt');
  }

  async generateTestFiles() {
    console.log('📝 Generating test case files...');
    
    // Check if parsed_cases.json exists
    if (!fs.existsSync('parsed_cases.json')) {
      console.error('❌ parsed_cases.json not found. Please run AI parsing first.');
      return;
    }

    const parsedCases = JSON.parse(fs.readFileSync('parsed_cases.json', 'utf8'));
    
    for (const caseData of parsedCases.cases) {
      const caseId = `Case_${caseData.caseNumber}`;
      const caseDir = path.join(this.testCasesDir, caseId);
      
      // Create case directory
      fs.mkdirSync(caseDir, { recursive: true });
      
      // Get CSV data for this case
      const csvData = this.csvData.get(caseData.caseNumber);
      if (!csvData) {
        console.warn(`⚠️  No CSV data found for ${caseId}`);
        continue;
      }

      // Create case_note.md
      fs.writeFileSync(
        path.join(caseDir, 'case_note.md'),
        `# ${caseId}\n\n${caseData.rawNarrative}`
      );

      // Create case_data.json
      const caseMetadata = {
        caseMeta: {
          patientId: csvData.mrn,
          providerId: caseData.staff,
          dateOfService: csvData.dos,
          claimType: "Professional"
        }
      };
      
      fs.writeFileSync(
        path.join(caseDir, 'case_data.json'),
        JSON.stringify(caseMetadata, null, 2)
      );

      // Create expected.json
      const expectedResults = {
        procedureCodes: csvData.procedureCodes,
        diagnosisCodes: csvData.diagnosisCodes
      };
      
      fs.writeFileSync(
        path.join(caseDir, 'expected.json'),
        JSON.stringify(expectedResults, null, 2)
      );
      
      console.log(`✅ Generated files for ${caseId}`);
    }
    
    console.log('🎉 All test case files generated successfully!');
  }
}

// Main execution
async function main() {
  const generator = new TestCaseGenerator();
  
  if (process.argv.includes('--generate-files')) {
    await generator.parseCsvData();
    await generator.generateTestFiles();
  } else {
    await generator.run();
  }
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default TestCaseGenerator;