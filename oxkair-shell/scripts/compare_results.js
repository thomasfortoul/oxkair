#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Results Comparison Script
 * 
 * Compares test outputs with expected results and generates
 * a comprehensive summary report.
 */

class ResultsComparator {
  constructor() {
    this.testCasesDir = 'test_cases';
    this.results = [];
  }

  async run() {
    console.log('📊 Starting results comparison...');
    
    try {
      await this.compareAllCases();
      await this.generateSummaryReport();
      
      console.log('✅ Comparison completed successfully!');
      console.log('📄 Check comparison_summary.md for detailed results');
      
    } catch (error) {
      console.error('❌ Error during comparison:', error.message);
      process.exit(1);
    }
  }

  async compareAllCases() {
    console.log('🔍 Analyzing test case results...');
    
    // Find all case directories
    const caseDirs = fs.readdirSync(this.testCasesDir)
      .filter(dir => dir.startsWith('Case_'))
      .sort((a, b) => {
        const numA = parseInt(a.replace('Case_', ''));
        const numB = parseInt(b.replace('Case_', ''));
        return numA - numB;
      });

    for (const caseDir of caseDirs) {
      const casePath = path.join(this.testCasesDir, caseDir);
      const result = await this.compareSingleCase(caseDir, casePath);
      this.results.push(result);
    }

    console.log(`✅ Analyzed ${this.results.length} test cases`);
  }

  async compareSingleCase(caseId, casePath) {
    const expectedPath = path.join(casePath, 'expected.json');
    const outputPath = path.join(casePath, 'output.json');

    // Initialize result object
    const result = {
      caseId,
      status: 'ERROR',
      procedureComparison: { matched: 0, total: 0, mismatched: 0 },
      diagnosisComparison: { matched: 0, total: 0, mismatched: 0 },
      details: {
        missingOutput: false,
        missingExpected: false,
        procedureDetails: [],
        diagnosisDetails: []
      }
    };

    try {
      // Check if files exist
      if (!fs.existsSync(expectedPath)) {
        result.details.missingExpected = true;
        result.status = 'MISSING_EXPECTED';
        return result;
      }

      if (!fs.existsSync(outputPath)) {
        result.details.missingOutput = true;
        result.status = 'MISSING_OUTPUT';
        return result;
      }

      // Load and parse files
      const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
      const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

      // Compare procedure codes
      result.procedureComparison = this.compareProcedureCodes(
        expected.procedureCodes || [],
        output.procedureCodes || []
      );

      // Compare diagnosis codes
      result.diagnosisComparison = this.compareDiagnosisCodes(
        expected.diagnosisCodes || [],
        output.diagnosisCodes || []
      );

      // Determine overall status
      const procedureMatch = result.procedureComparison.matched === result.procedureComparison.total;
      const diagnosisMatch = result.diagnosisComparison.matched === result.diagnosisComparison.total;
      
      if (procedureMatch && diagnosisMatch && 
          result.procedureComparison.total > 0 && result.diagnosisComparison.total > 0) {
        result.status = 'PERFECT_MATCH';
      } else if (result.procedureComparison.matched > 0 || result.diagnosisComparison.matched > 0) {
        result.status = 'PARTIAL_MATCH';
      } else {
        result.status = 'NO_MATCH';
      }

    } catch (error) {
      result.status = 'ERROR';
      result.error = error.message;
    }

    return result;
  }

  compareProcedureCodes(expected, actual) {
    const comparison = {
      matched: 0,
      total: expected.length,
      mismatched: 0,
      details: []
    };

    for (const expectedProc of expected) {
      const match = actual.find(actualProc => 
        actualProc.code === expectedProc.code && 
        (actualProc.modifier || '') === (expectedProc.modifier || '')
      );

      if (match) {
        comparison.matched++;
        comparison.details.push({
          code: expectedProc.code,
          modifier: expectedProc.modifier,
          status: 'MATCHED'
        });
      } else {
        comparison.mismatched++;
        comparison.details.push({
          code: expectedProc.code,
          modifier: expectedProc.modifier,
          status: 'MISSING',
          actualCodes: actual.map(a => `${a.code}${a.modifier ? `-${a.modifier}` : ''}`)
        });
      }
    }

    // Check for extra codes in actual results
    for (const actualProc of actual) {
      const match = expected.find(expectedProc => 
        expectedProc.code === actualProc.code && 
        (expectedProc.modifier || '') === (actualProc.modifier || '')
      );

      if (!match) {
        comparison.details.push({
          code: actualProc.code,
          modifier: actualProc.modifier,
          status: 'EXTRA'
        });
      }
    }

    return comparison;
  }

  compareDiagnosisCodes(expected, actual) {
    const comparison = {
      matched: 0,
      total: expected.length,
      mismatched: 0,
      details: []
    };

    for (const expectedDiag of expected) {
      const match = actual.find(actualDiag => actualDiag.code === expectedDiag.code);

      if (match) {
        comparison.matched++;
        comparison.details.push({
          code: expectedDiag.code,
          status: 'MATCHED'
        });
      } else {
        comparison.mismatched++;
        comparison.details.push({
          code: expectedDiag.code,
          status: 'MISSING',
          actualCodes: actual.map(a => a.code)
        });
      }
    }

    // Check for extra codes in actual results
    for (const actualDiag of actual) {
      const match = expected.find(expectedDiag => expectedDiag.code === actualDiag.code);

      if (!match) {
        comparison.details.push({
          code: actualDiag.code,
          status: 'EXTRA'
        });
      }
    }

    return comparison;
  }

  async generateSummaryReport() {
    console.log('📝 Generating summary report...');

    const totalCases = this.results.length;
    const perfectMatches = this.results.filter(r => r.status === 'PERFECT_MATCH').length;
    const partialMatches = this.results.filter(r => r.status === 'PARTIAL_MATCH').length;
    const noMatches = this.results.filter(r => r.status === 'NO_MATCH').length;
    const errors = this.results.filter(r => r.status === 'ERROR' || r.status.includes('MISSING')).length;

    let report = `# Automated Case Testing Results\n\n`;
    report += `**Generated:** ${new Date().toISOString()}\n\n`;
    
    // Summary statistics
    report += `## Summary Statistics\n\n`;
    report += `- **Total Cases:** ${totalCases}\n`;
    report += `- **Perfect Matches:** ${perfectMatches} (${((perfectMatches/totalCases)*100).toFixed(1)}%)\n`;
    report += `- **Partial Matches:** ${partialMatches} (${((partialMatches/totalCases)*100).toFixed(1)}%)\n`;
    report += `- **No Matches:** ${noMatches} (${((noMatches/totalCases)*100).toFixed(1)}%)\n`;
    report += `- **Errors/Missing:** ${errors} (${((errors/totalCases)*100).toFixed(1)}%)\n\n`;

    // Detailed results table
    report += `## Detailed Results\n\n`;
    report += `| Case ID | Status | Procedures | Diagnoses | Notes |\n`;
    report += `|---------|--------|------------|-----------|-------|\n`;

    for (const result of this.results) {
      const statusEmoji = this.getStatusEmoji(result.status);
      const procedureText = `${result.procedureComparison.matched}/${result.procedureComparison.total}`;
      const diagnosisText = `${result.diagnosisComparison.matched}/${result.diagnosisComparison.total}`;
      
      let notes = '';
      if (result.status === 'ERROR') {
        notes = `Error: ${result.error || 'Unknown error'}`;
      } else if (result.details.missingOutput) {
        notes = 'Missing output file';
      } else if (result.details.missingExpected) {
        notes = 'Missing expected file';
      }

      report += `| ${result.caseId} | ${statusEmoji} ${result.status} | ${procedureText} | ${diagnosisText} | ${notes} |\n`;
    }

    // Detailed breakdown for failed cases
    const failedCases = this.results.filter(r => 
      r.status !== 'PERFECT_MATCH' && !r.status.includes('MISSING') && r.status !== 'ERROR'
    );

    if (failedCases.length > 0) {
      report += `\n## Failed Case Details\n\n`;
      
      for (const result of failedCases) {
        report += `### ${result.caseId}\n\n`;
        
        if (result.procedureComparison.details.length > 0) {
          report += `**Procedure Codes:**\n`;
          for (const detail of result.procedureComparison.details) {
            const status = detail.status === 'MATCHED' ? '✅' : 
                          detail.status === 'MISSING' ? '❌' : '⚠️';
            report += `- ${status} ${detail.code}${detail.modifier ? `-${detail.modifier}` : ''} (${detail.status})\n`;
          }
          report += `\n`;
        }

        if (result.diagnosisComparison.details.length > 0) {
          report += `**Diagnosis Codes:**\n`;
          for (const detail of result.diagnosisComparison.details) {
            const status = detail.status === 'MATCHED' ? '✅' : 
                          detail.status === 'MISSING' ? '❌' : '⚠️';
            report += `- ${status} ${detail.code} (${detail.status})\n`;
          }
          report += `\n`;
        }
      }
    }

    // Save report
    fs.writeFileSync('comparison_summary.md', report);
    
    console.log('✅ Summary report saved to comparison_summary.md');
  }

  getStatusEmoji(status) {
    switch (status) {
      case 'PERFECT_MATCH': return '✅';
      case 'PARTIAL_MATCH': return '⚠️';
      case 'NO_MATCH': return '❌';
      case 'ERROR': return '💥';
      case 'MISSING_OUTPUT': return '📄';
      case 'MISSING_EXPECTED': return '📋';
      default: return '❓';
    }
  }
}

// Main execution
async function main() {
  const comparator = new ResultsComparator();
  await comparator.run();
}

if (require.main === module) {
  main();
}

module.exports = ResultsComparator;