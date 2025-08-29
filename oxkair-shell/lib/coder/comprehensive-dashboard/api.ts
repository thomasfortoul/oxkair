// API service for comprehensive dashboard operations
// Migrated from oxkair-coder to oxkair-shell
// Updated to use oxkair-shell's database and auth services

interface ApiResponse<T> {
  success?: boolean
  error?: string
  data?: T
}

interface PanelData {
  caseId: string
  panelType: string
  panelData: any
  aiRawOutput: any
  flags: any[]
  submittedBy?: string
  submittedAt?: string
  userType?: string
}

interface Flag {
  id: number
  case_id: string
  panel_type: string
  flag_type: string
  severity: 'high' | 'medium' | 'low'
  message: string
  field_name?: string
  resolved: boolean
  resolved_by?: string
  resolved_at?: string
  resolution_notes?: string
  created_at: string
}

interface AuditEntry {
  id: number
  case_id: string
  panel_type?: string
  action_type: string
  field_name?: string
  old_value?: any
  new_value?: any
  user_id: string
  user_type?: 'coder' | 'provider'
  rationale?: string
  created_at: string
}

interface Attestation {
  id: number
  case_id: string
  assistant_name: string
  assistant_role: 'assistant' | 'co-surgeon'
  document_path: string
  document_name: string
  document_size: number
  document_type: string
  uploaded_at: string
  uploaded_by: string
}

class ComprehensiveDashboardAPI {
  private baseUrl: string

  constructor() {
    this.baseUrl = '/api'
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      credentials: 'include', // Include cookies for authentication
      ...options,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
    }

    return response.json()
  }

  // Panel Management
  async getPanelData(caseId: string, panelType: string): Promise<PanelData> {
    return this.request<PanelData>(`/cases/${caseId}/panels/${panelType}`)
  }

  async updatePanelData(
    caseId: string,
    panelType: string,
    panelData: any,
    userId: string,
    userType: 'coder' | 'provider',
    rationale?: string
  ): Promise<ApiResponse<any>> {
    return this.request<ApiResponse<any>>(`/cases/${caseId}/panels/${panelType}`, {
      method: 'PUT',
      body: JSON.stringify({
        panelData,
        userId,
        userType,
        rationale
      })
    })
  }

  // Flag Management
  async getFlags(
    caseId: string,
    panelType?: string,
    resolved?: boolean
  ): Promise<{ flags: Flag[] }> {
    const params = new URLSearchParams()
    if (panelType) params.append('panelType', panelType)
    if (resolved !== undefined) params.append('resolved', resolved.toString())
    
    const query = params.toString() ? `?${params.toString()}` : ''
    return this.request<{ flags: Flag[] }>(`/cases/${caseId}/flags${query}`)
  }

  async createFlag(
    caseId: string,
    panelType: string,
    flagType: string,
    severity: 'high' | 'medium' | 'low',
    message: string,
    fieldName?: string,
    userId?: string
  ): Promise<{ flag: Flag }> {
    return this.request<{ flag: Flag }>(`/cases/${caseId}/flags`, {
      method: 'POST',
      body: JSON.stringify({
        panelType,
        flagType,
        severity,
        message,
        fieldName,
        userId
      })
    })
  }

  async resolveFlag(
    caseId: string,
    flagId: number,
    userId: string,
    userType: 'coder' | 'provider',
    resolutionNotes?: string
  ): Promise<{ success: boolean; flag: Flag }> {
    return this.request<{ success: boolean; flag: Flag }>(
      `/cases/${caseId}/flags/${flagId}/resolve`,
      {
        method: 'PUT',
        body: JSON.stringify({
          userId,
          userType,
          resolutionNotes
        })
      }
    )
  }

  async unresolveFlag(
    caseId: string,
    flagId: number,
    userId: string,
    userType: 'coder' | 'provider'
  ): Promise<{ success: boolean; flag: Flag }> {
    return this.request<{ success: boolean; flag: Flag }>(
      `/cases/${caseId}/flags/${flagId}/resolve`,
      {
        method: 'DELETE',
        body: JSON.stringify({
          userId,
          userType
        })
      }
    )
  }

  // AI Output Management
  async getAIOutput(caseId: string): Promise<{
    caseId: string
    aiRawOutput: any
    createdAt: string
    updatedAt: string
  }> {
    return this.request(`/cases/${caseId}/ai-output`)
  }

  async updateAIOutput(
    caseId: string,
    aiOutput: any,
    userId: string
  ): Promise<ApiResponse<any>> {
    return this.request<ApiResponse<any>>(`/cases/${caseId}/ai-output`, {
      method: 'POST',
      body: JSON.stringify({
        aiOutput,
        userId
      })
    })
  }

  // Case Data Management
  async updateCaseData(
    caseId: string,
    updateData: {
      mrn?: string;
      date_of_service?: string | null;
      insurance_provider?: string | null;
      content?: string;
      operative_notes?: string;
      admission_notes?: string;
      discharge_notes?: string;
      pathology_notes?: string;
      progress_notes?: string;
      title?: string;
      tags?: string[];
      source?: 'editor' | 'coder';
      status?: 'INCOMPLETE' | 'PENDING_CODER_REVIEW' | 'PENDING_PROVIDER_REVIEW' | 'PENDING_BILLING';
      ai_raw_output?: any;
      final_processed_data?: any;
      summary_data?: any;
      provider_user_id?: string | null;
      provider_approved_at?: string | null;
      provider_decision?: 'approved' | 'rejected' | null;
    }
  ): Promise<ApiResponse<any>> {
    return this.request<ApiResponse<any>>(`/cases/${caseId}`, {
      method: 'PUT',
      body: JSON.stringify(updateData)
    })
  }

  // Submission and Approval
  async submitForApproval(
    caseId: string,
    userId: string,
    userType: 'coder' | 'provider',
    submissionType: 'submit_to_provider' | 'finalize_and_submit' | 'approve_and_finalize',
    notes?: string
  ): Promise<{
    success: boolean
    newStatus: string
    newWorkflowStatus: string
    unresolvedFlags: Flag[]
  }> {
    return this.request(`/cases/${caseId}/submit-approval`, {
      method: 'POST',
      body: JSON.stringify({
        userId,
        userType,
        submissionType,
        notes
      })
    })
  }

  // Attestation Management
  async getAttestations(caseId: string): Promise<{ attestations: Attestation[] }> {
    return this.request<{ attestations: Attestation[] }>(`/cases/${caseId}/attestations`)
  }

  async uploadAttestation(
    caseId: string,
    assistantName: string,
    assistantRole: 'assistant' | 'co-surgeon',
    file: File,
    userId: string
  ): Promise<{ success: boolean; attestation: Attestation }> {
    const formData = new FormData()
    formData.append('assistantName', assistantName)
    formData.append('assistantRole', assistantRole)
    formData.append('file', file)
    formData.append('userId', userId)

    const response = await fetch(`${this.baseUrl}/cases/${caseId}/attestations`, {
      method: 'POST',
      body: formData,
      credentials: 'include' // Include cookies for authentication
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
    }

    return response.json()
  }

  async deleteAttestation(
    caseId: string,
    attestationId: number,
    userId: string
  ): Promise<{ success: boolean }> {
    const params = new URLSearchParams({
      attestationId: attestationId.toString(),
      userId
    })

    return this.request<{ success: boolean }>(
      `/cases/${caseId}/attestations?${params.toString()}`,
      {
        method: 'DELETE'
      }
    )
  }

  // Audit Trail
  async getAuditTrail(
    caseId: string,
    panelType?: string,
    limit?: number
  ): Promise<{ entries: AuditEntry[] }> {
    // Parameters are intended for use in the actual API call.
    // The line below is to acknowledge their presence for linters
    // in this placeholder version, without altering behavior.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ = { caseId, panelType, limit }; 

    // Actual implementation (commented out for placeholder):
    /*
    const actualParams = new URLSearchParams();
    if (panelType) actualParams.append('panelType', panelType);
    if (limit !== undefined) actualParams.append('limit', limit.toString());
    const query = actualParams.toString() ? `?${actualParams.toString()}` : '';
    // 'caseId' would be part of the path, e.g., /cases/${caseId}/audit-trail
    return this.request<{ entries: AuditEntry[] }>(`/cases/${caseId}/audit-trail${query}`);
    */

    // This would need to be implemented as a separate endpoint
    // For now, we'll return empty array
    return { entries: [] };
  }

  // Business Logic Validation
  async validateICD10Code(code: string): Promise<{
    valid: boolean
    description?: string
    includes?: string[]
    excludes?: string[]
    additionalCodesRequired?: string[]
  }> {
    // This would integrate with ICD-10 validation service
    // For now, basic validation
    const icd10Pattern = /^[A-Z]\d{2}(\.\d{1,3})?$/
    return {
      valid: icd10Pattern.test(code),
      description: code // Placeholder
    }
  }

  async validateCPTCode(code: string): Promise<{
    valid: boolean
    description?: string
    baseRVU?: number
    isAddOnCode?: boolean
    requiresParentCode?: boolean
    parentCode?: string
  }> {
    // This would integrate with CPT validation service
    // For now, basic validation
    const cptPattern = /^\d{5}$/
    return {
      valid: cptPattern.test(code),
      description: code, // Placeholder
      baseRVU: 1.0 // Placeholder
    }
  }

  async validateNPI(npi: string): Promise<{
    valid: boolean
    providerName?: string
    specialty?: string
  }> {
    // This would integrate with NPI validation service
    // For now, basic validation
    const npiPattern = /^\d{10}$/
    return {
      valid: npiPattern.test(npi)
    }
  }

  // RVU Calculations
  async calculateRVUSequence(
    procedures: Array<{
      code: string
    }>
  ): Promise<{
    optimizedOrder: Array<{
      code: string
      description: string
      baseRVU: number
      adjustedRVU: number
      appliedModifiers: string[]
      sequencePosition: number
      sequenceExplanation: string
    }>
    totalRVU: number
    explanation: string
    modifier51Applied: boolean
  }> {
    // This would integrate with RVU calculation service
    // For now, return placeholder data
    // The 'procedures' parameter is used in the placeholder logic below.
    // If a linting error for 'unused procedures' persists, it might be a linter configuration issue
    // or a misunderstanding of the error, as 'procedures.map' and 'procedures.length' constitute usage.
    /*
    return this.request(`/calculations/rvu-sequence`, {
      method: 'POST',
      body: JSON.stringify({ procedures })
    })
    */
    return {
      optimizedOrder: procedures.map((proc, index) => ({
        code: proc.code,
        description: `Procedure ${proc.code}`,
        baseRVU: 1.0,
        adjustedRVU: index === 0 ? 1.0 : 0.5, // Simple modifier 51 simulation
        appliedModifiers: [], // Modifiers will be handled by modifier-assignment-agent
        sequencePosition: index + 1,
        sequenceExplanation: index === 0 ? 'Primary procedure' : 'Secondary procedure with modifier 51'
      })),
      totalRVU: procedures.length > 0 ? 1.0 + (procedures.length - 1) * 0.5 : 0,
      explanation: 'Procedures ordered by RVU value with modifier 51 applied to secondary procedures',
      modifier51Applied: procedures.length > 1
    }
  }

  // Compliance Checks
  async checkCCIEdits(
    procedures: Array<{ code: string }>
  ): Promise<{
    edits: Array<{
      code1: string
      code2: string
      editType: 'column1' | 'column2'
      modifier: string
      description: string
    }>
  }> {
    // Parameter 'procedures' is intended for use in the actual API call.
    // The line below is to acknowledge its presence for linters
    // in this placeholder version, without altering behavior.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ = { procedures };

    // Actual implementation (commented out for placeholder):
    /*
    return this.request(`/compliance/cci-edits`, {
      method: 'POST',
      body: JSON.stringify({ procedures })
    });
    */

    // This would integrate with CCI edit checking service
    return { edits: [] }; // Placeholder response
  }

  async checkMUELimits(
    procedures: Array<{ code: string; units: number }>
  ): Promise<{
    violations: Array<{
      code: string
      allowedUnits: number
      reportedUnits: number
      description: string
    }>
  }> {
    // This would integrate with MUE checking service
    return { violations: [] }
  }
}

// Export singleton instance
export const dashboardAPI = new ComprehensiveDashboardAPI()

// Export types for use in components
export type {
  PanelData,
  Flag,
  AuditEntry,
  Attestation,
  ApiResponse
}