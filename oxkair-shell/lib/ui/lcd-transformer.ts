/**
 * LCD Result Transformer
 *
 * This module provides utilities to transform LCD evaluation results
 * into formats suitable for frontend display and user interaction.
 */

import { LCDCheckOutput, LCDPolicyEvaluation, StandardizedWorkflowState } from '../agents/newtypes';

export interface LCDDisplayResult {
  overallStatus: 'Pass' | 'Fail' | 'Partial' | 'Unknown';
  overallStatusColor: 'green' | 'red' | 'yellow' | 'gray';
  overallStatusLabel: string;
  confidence: number;
  summary: {
    totalPolicies: number;
    passedPolicies: number;
    failedPolicies: number;
    unknownPolicies: number;
    criticalIssues: number;
    recommendations: number;
  };
  bestMatch: {
    policyId: string;
    title: string;
    status: 'Pass' | 'Fail' | 'Unknown';
    confidence: number;
    statusColor: 'green' | 'red' | 'yellow' | 'gray';
  };
  policies: LCDPolicyDisplayItem[];
  criticalIssues: string[];
  recommendations: string[];
  processingDetails: {
    dateOfService: string;
    jurisdiction: string;
    retrievalTime: string;
    synthesisTime: string;
    totalProcessingTime: string;
    cacheUsed: boolean;
  };
  actionItems: LCDActionItem[];
}

export interface LCDPolicyDisplayItem {
  policyId: string;
  title: string;
  jurisdiction: string;
  effectiveDate: string;
  relevanceScore: number;
  status: 'Pass' | 'Fail' | 'Unknown';
  statusColor: 'green' | 'red' | 'yellow' | 'gray';
  statusLabel: string;
  unmetCriteria: LCDUnmetCriteriaDisplay[];
  summary: string;
  showDetails: boolean;
}

export interface LCDUnmetCriteriaDisplay {
  criterion: string;
  description: string;
  action: string;
  severity: 'Critical' | 'Warning' | 'Info';
  severityColor: 'red' | 'yellow' | 'blue';
  noteEvidence?: string;
}

export interface LCDActionItem {
  id: string;
  title: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  priorityColor: 'red' | 'yellow' | 'green';
  category: 'Documentation' | 'Clinical' | 'Administrative';
  relatedPolicies: string[];
  completed: boolean;
}

/**
 * Transforms LCD check output into a format suitable for frontend display.
 */
export function transformLCDResult(
  lcdResult: LCDCheckOutput,
  state?: StandardizedWorkflowState,
): LCDDisplayResult {
  const overallStatusColor = getStatusColor(lcdResult.overallCoverageStatus);
  const overallStatusLabel = getStatusLabel(lcdResult.overallCoverageStatus);

  const summary = {
    totalPolicies: lcdResult.evaluations.length,
    passedPolicies: lcdResult.evaluations.filter(e => e.coverageStatus === 'Pass').length,
    failedPolicies: lcdResult.evaluations.filter(e => e.coverageStatus === 'Fail').length,
    unknownPolicies: lcdResult.evaluations.filter(e => e.coverageStatus === 'Unknown').length,
    criticalIssues: lcdResult.criticalIssues.length,
    recommendations: lcdResult.recommendations.length,
  };

  const bestMatch = {
    policyId: lcdResult.bestMatch.policyId,
    title: lcdResult.evaluations.find(e => e.policyId === lcdResult.bestMatch.policyId)?.title || 'Unknown',
    status: lcdResult.bestMatch.coverageStatus,
    confidence: Math.round(lcdResult.bestMatch.confidence * 100),
    statusColor: getStatusColor(lcdResult.bestMatch.coverageStatus),
  };

  const policies = lcdResult.evaluations.map(transformPolicyEvaluation);

  const processingDetails = {
    dateOfService: new Date(lcdResult.dateOfService).toLocaleDateString(),
    jurisdiction: lcdResult.macJurisdiction,
    retrievalTime: formatDuration(lcdResult.processingMetadata.retrievalTime),
    synthesisTime: formatDuration(lcdResult.processingMetadata.synthesisTime),
    totalProcessingTime: formatDuration(
      lcdResult.processingMetadata.retrievalTime + lcdResult.processingMetadata.synthesisTime
    ),
    cacheUsed: lcdResult.processingMetadata.cacheHit,
  };

  const actionItems = generateActionItems(lcdResult);

  const confidence = calculateOverallConfidence(lcdResult);

  return {
    overallStatus: lcdResult.overallCoverageStatus,
    overallStatusColor,
    overallStatusLabel,
    confidence,
    summary,
    bestMatch,
    policies,
    criticalIssues: lcdResult.criticalIssues,
    recommendations: lcdResult.recommendations,
    processingDetails,
    actionItems,
  };
}

/**
 * Transforms a single policy evaluation for display.
 */
function transformPolicyEvaluation(evaluation: LCDPolicyEvaluation): LCDPolicyDisplayItem {
  const statusColor = getStatusColor(evaluation.coverageStatus);
  const statusLabel = getStatusLabel(evaluation.coverageStatus);

  const unmetCriteria = evaluation.unmetCriteria.map(criterion => ({
    criterion: criterion.criterion,
    description: criterion.description,
    action: criterion.action,
    severity: criterion.severity,
    severityColor: getSeverityColor(criterion.severity),
    noteEvidence: criterion.noteEvidence,
  }));

  const summary = generatePolicySummary(evaluation);

  return {
    policyId: evaluation.policyId,
    title: evaluation.title,
    jurisdiction: evaluation.jurisdiction,
    effectiveDate: new Date(evaluation.effectiveDate).toLocaleDateString(),
    relevanceScore: Math.round(evaluation.score * 100),
    status: evaluation.coverageStatus,
    statusColor,
    statusLabel,
    unmetCriteria,
    summary,
    showDetails: false,
  };
}

/**
 * Generates action items based on LCD evaluation results.
 */
function generateActionItems(lcdResult: LCDCheckOutput): LCDActionItem[] {
  const actionItems: LCDActionItem[] = [];
  let actionId = 1;

  // Generate action items for critical issues
  lcdResult.criticalIssues.forEach(issue => {
    actionItems.push({
      id: `action-${actionId++}`,
      title: 'Resolve Critical Issue',
      description: issue,
      priority: 'High',
      priorityColor: 'red',
      category: 'Clinical',
      relatedPolicies: [],
      completed: false,
    });
  });

  // Generate action items for recommendations
  lcdResult.recommendations.forEach(recommendation => {
    actionItems.push({
      id: `action-${actionId++}`,
      title: 'Implement Recommendation',
      description: recommendation,
      priority: 'Medium',
      priorityColor: 'yellow',
      category: 'Documentation',
      relatedPolicies: [],
      completed: false,
    });
  });

  // Generate action items for failed policies
  lcdResult.evaluations
    .filter(e => e.coverageStatus === 'Fail')
    .forEach(evaluation => {
      evaluation.unmetCriteria.forEach(criterion => {
        actionItems.push({
          id: `action-${actionId++}`,
          title: `Address ${criterion.criterion}`,
          description: criterion.action,
          priority: criterion.severity === 'Critical' ? 'High' : 'Medium',
          priorityColor: criterion.severity === 'Critical' ? 'red' : 'yellow',
          category: categorizeAction(criterion.action),
          relatedPolicies: [evaluation.policyId],
          completed: false,
        });
      });
    });

  return actionItems;
}

/**
 * Gets the appropriate color for a coverage status.
 */
function getStatusColor(status: 'Pass' | 'Fail' | 'Partial' | 'Unknown'): 'green' | 'red' | 'yellow' | 'gray' {
  switch (status) {
    case 'Pass':
      return 'green';
    case 'Fail':
      return 'red';
    case 'Partial':
      return 'yellow';
    case 'Unknown':
    default:
      return 'gray';
  }
}

/**
 * Gets the appropriate label for a coverage status.
 */
function getStatusLabel(status: 'Pass' | 'Fail' | 'Partial' | 'Unknown'): string {
  switch (status) {
    case 'Pass':
      return 'Coverage Approved';
    case 'Fail':
      return 'Coverage Denied';
    case 'Partial':
      return 'Partial Coverage';
    case 'Unknown':
    default:
      return 'Review Required';
  }
}

/**
 * Gets the appropriate color for a severity level.
 */
function getSeverityColor(severity: 'Critical' | 'Warning' | 'Info'): 'red' | 'yellow' | 'blue' {
  switch (severity) {
    case 'Critical':
      return 'red';
    case 'Warning':
      return 'yellow';
    case 'Info':
    default:
      return 'blue';
  }
}

/**
 * Formats duration in milliseconds to a human-readable string.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  }
}

/**
 * Generates a summary for a policy evaluation.
 */
function generatePolicySummary(evaluation: LCDPolicyEvaluation): string {
  const { coverageStatus, unmetCriteria } = evaluation;

  if (coverageStatus === 'Pass') {
    return 'All coverage criteria are met. This policy supports coverage approval.';
  } else if (coverageStatus === 'Fail') {
    const criticalCount = unmetCriteria.filter(c => c.severity === 'Critical').length;
    const warningCount = unmetCriteria.filter(c => c.severity === 'Warning').length;

    if (criticalCount > 0) {
      return `${criticalCount} critical issue${criticalCount > 1 ? 's' : ''} prevent${criticalCount === 1 ? 's' : ''} coverage approval.`;
    } else if (warningCount > 0) {
      return `${warningCount} warning${warningCount > 1 ? 's' : ''} may affect coverage approval.`;
    } else {
      return 'Coverage criteria are not met.';
    }
  } else {
    return 'Policy evaluation could not be completed. Manual review required.';
  }
}

/**
 * Categorizes an action based on its description.
 */
function categorizeAction(action: string): 'Documentation' | 'Clinical' | 'Administrative' {
  const actionLower = action.toLowerCase();

  if (actionLower.includes('document') || actionLower.includes('note') || actionLower.includes('record')) {
    return 'Documentation';
  } else if (actionLower.includes('clinical') || actionLower.includes('medical') || actionLower.includes('diagnosis')) {
    return 'Clinical';
  } else {
    return 'Administrative';
  }
}

/**
 * Calculates overall confidence based on LCD evaluation results.
 */
function calculateOverallConfidence(lcdResult: LCDCheckOutput): number {
  const evaluations = lcdResult.evaluations;

  if (evaluations.length === 0) {
    return 0;
  }

  // Base confidence on relevance scores and evaluation certainty
  const avgRelevanceScore = evaluations.reduce((sum, e) => sum + e.score, 0) / evaluations.length;
  const certaintyScore = evaluations.filter(e => e.coverageStatus !== 'Unknown').length / evaluations.length;

  // Factor in processing metadata
  const processingScore = lcdResult.processingMetadata.cacheHit ? 0.9 : 0.8;

  return Math.round((avgRelevanceScore * 0.4 + certaintyScore * 0.4 + processingScore * 0.2) * 100);
}

/**
 * Filters LCD results for display based on user preferences.
 */
export function filterLCDResults(
  result: LCDDisplayResult,
  filters: {
    showOnlyFailed?: boolean;
    showOnlyCritical?: boolean;
    minConfidence?: number;
    policyIds?: string[];
  },
): LCDDisplayResult {
  let filteredPolicies = result.policies;

  if (filters.showOnlyFailed) {
    filteredPolicies = filteredPolicies.filter(p => p.status === 'Fail');
  }

  if (filters.showOnlyCritical) {
    filteredPolicies = filteredPolicies.filter(p =>
      p.unmetCriteria.some(c => c.severity === 'Critical')
    );
  }

  if (filters.minConfidence !== undefined) {
    filteredPolicies = filteredPolicies.filter(p => p.relevanceScore >= filters.minConfidence!);
  }

  if (filters.policyIds && filters.policyIds.length > 0) {
    filteredPolicies = filteredPolicies.filter(p => filters.policyIds!.includes(p.policyId));
  }

  return {
    ...result,
    policies: filteredPolicies,
  };
}

/**
 * Exports LCD results for external use (e.g., reports, exports).
 */
export function exportLCDResults(
  result: LCDDisplayResult,
  format: 'json' | 'csv' | 'summary',
): string {
  switch (format) {
    case 'json':
      return JSON.stringify(result, null, 2);

    case 'csv':
      return exportLCDResultsAsCSV(result);

    case 'summary':
      return exportLCDResultsAsSummary(result);

    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}

/**
 * Exports LCD results as CSV format.
 */
function exportLCDResultsAsCSV(result: LCDDisplayResult): string {
  const headers = [
    'Policy ID',
    'Title',
    'Jurisdiction',
    'Status',
    'Relevance Score',
    'Unmet Criteria Count',
    'Critical Issues',
    'Effective Date',
  ];

  const rows = result.policies.map(policy => [
    policy.policyId,
    policy.title,
    policy.jurisdiction,
    policy.status,
    policy.relevanceScore,
    policy.unmetCriteria.length,
    policy.unmetCriteria.filter(c => c.severity === 'Critical').length,
    policy.effectiveDate,
  ]);

  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

/**
 * Exports LCD results as a summary format.
 */
function exportLCDResultsAsSummary(result: LCDDisplayResult): string {
  const summary = `
LCD Coverage Evaluation Summary
===============================

Overall Status: ${result.overallStatusLabel}
Confidence: ${result.confidence}%
Date of Service: ${result.processingDetails.dateOfService}
Jurisdiction: ${result.processingDetails.jurisdiction}

Summary Statistics:
- Total Policies Evaluated: ${result.summary.totalPolicies}
- Passed: ${result.summary.passedPolicies}
- Failed: ${result.summary.failedPolicies}
- Unknown: ${result.summary.unknownPolicies}
- Critical Issues: ${result.summary.criticalIssues}
- Recommendations: ${result.summary.recommendations}

Best Match:
- Policy: ${result.bestMatch.title} (${result.bestMatch.policyId})
- Status: ${result.bestMatch.status}
- Confidence: ${result.bestMatch.confidence}%

${result.criticalIssues.length > 0 ? `
Critical Issues:
${result.criticalIssues.map(issue => `- ${issue}`).join('\n')}
` : ''}

${result.recommendations.length > 0 ? `
Recommendations:
${result.recommendations.map(rec => `- ${rec}`).join('\n')}
` : ''}

Processing Details:
- Retrieval Time: ${result.processingDetails.retrievalTime}
- Synthesis Time: ${result.processingDetails.synthesisTime}
- Total Processing Time: ${result.processingDetails.totalProcessingTime}
- Cache Used: ${result.processingDetails.cacheUsed ? 'Yes' : 'No'}
`;

  return summary.trim();
}