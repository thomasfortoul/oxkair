/**
 * Client-side API service for medical notes
 * Simplified version that uses a fixed OID from environment for local development
 */

export interface MedicalNote {
  id: string;
  user_id?: string;
  case_number?: string;
  mrn?: string;
  date_of_service?: string | null;
  insurance_provider?: string | null;
  operative_notes?: string;
  admission_notes?: string;
  discharge_notes?: string;
  pathology_notes?: string;
  progress_notes?: string;
  bedside_notes?: string;
  billable_notes?: string[];
  panel_data?: any;
  status?: string;
  workflow_status?: string;
  provider_user_id?: string | null;
  summary_data?: any;
  institution_id?: string | null;
  ai_raw_output?: any;
  final_processed_data?: any;
  created_at?: string;
  updated_at?: string;
}

export interface CreateMedicalNoteData {
  id?: string;
  mrn?: string;
  date_of_service?: string | null;
  insurance_provider?: string | null;
  operative_notes?: string;
  admission_notes?: string;
  discharge_notes?: string;
  pathology_notes?: string;
  progress_notes?: string;
  bedside_notes?: string;
  billable_notes?: string[];
  panel_data?: any;
  status?:
    | "INCOMPLETE"
    | "PENDING_CODER_REVIEW"
    | "PENDING_PROVIDER_REVIEW"
    | "PENDING_BILLING";
  workflow_status?: string;
  provider_user_id?: string | null;
  summary_data?: any;
  institution_id?: string | null;
  ai_raw_output?: any;
  final_processed_data?: any;
}

export interface UpdateMedicalNoteData {
  mrn?: string;
  date_of_service?: string | null;
  insurance_provider?: string | null;
  operative_notes?: string;
  admission_notes?: string;
  discharge_notes?: string;
  pathology_notes?: string;
  progress_notes?: string;
  bedside_notes?: string;
  billable_notes?: string[];
  panel_data?: any;
  status?:
    | "INCOMPLETE"
    | "PENDING_CODER_REVIEW"
    | "PENDING_PROVIDER_REVIEW"
    | "PENDING_BILLING";
  workflow_status?: string;
  ai_raw_output?: any;
  final_processed_data?: any;
  provider_user_id?: string | null;
  summary_data?: any;
  institution_id?: string | null;
}

class MedicalNotesClient {
  private userId: string | null = null;

  /**
   * Set the current user ID (OID) for API requests
   * This should be called after authentication
   */
  setUserId(userId: string) {
    this.userId = userId;
  }

  /**
   * Get the current user ID (OID)
   * Returns the set user ID or a default sample OID for local development
   */
  getUserId(): string {
    // Use the set user ID if available
    if (this.userId) {
      return this.userId;
    }
    
    // Only use sample OID in non-production environments
    if (process.env.NODE_ENV !== 'production') {
      return process.env.SAMPLE_USER_OID ||  '';
    }
    
    // In production, if no user ID is set, throw an error
    throw new Error('User not authenticated');
  }

  private async fetchWithSimpleAuth(url: string, options: RequestInit = {}) {
    console.log("[MedicalNotesClient] fetchWithSimpleAuth called with URL:", url);
    // No authentication headers needed - server will use sample OID
    const response = await fetch(url, {
      ...options,
      credentials: 'include', // Include cookies for authentication
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    console.log("[MedicalNotesClient] fetchWithSimpleAuth response status:", response.status);
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[MedicalNotesClient] fetchWithSimpleAuth error response:", errorText);
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        errorData = { error: errorText || 'Unknown error' };
      }
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("[MedicalNotesClient] fetchWithSimpleAuth successful response data length:", Array.isArray(data) ? data.length : typeof data);
    return data;
  }

  async getMedicalNotesByUser(): Promise<MedicalNote[]> {
    console.log("[MedicalNotesClient] getMedicalNotesByUser called");
    // Always use the current user's OID
    const userId = this.getUserId();
    console.log("[MedicalNotesClient] getMedicalNotesByUser using userId:");
    // Don't send userId as query parameter - server will use authenticated user's ID
    const url = new URL("/api/medical-notes", window.location.origin);
    console.log("[MedicalNotesClient] getMedicalNotesByUser fetching from URL:", url.toString());
    return this.fetchWithSimpleAuth(url.toString());
  }

  async getMedicalNoteById(caseId: string): Promise<MedicalNote | null> {
    try {
      return await this.fetchWithSimpleAuth(`/api/medical-notes/${caseId}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes("404")) {
        return null;
      }
      throw error;
    }
  }

  async createMedicalNote(caseData: CreateMedicalNoteData): Promise<MedicalNote> {
    const userId = this.getUserId();
    return this.fetchWithSimpleAuth("/api/medical-notes", {
      method: "POST",
      body: JSON.stringify({ userId, ...caseData }),
    });
  }

  async updateMedicalNote(noteId: string, updateData: UpdateMedicalNoteData): Promise<MedicalNote> {
    return this.fetchWithSimpleAuth(`/api/medical-notes/${noteId}`, {
      method: "PUT",
      body: JSON.stringify(updateData),
    });
  }

  async deleteMedicalNote(noteId: string): Promise<void> {
    await this.fetchWithSimpleAuth(`/api/medical-notes/${noteId}`, {
      method: "DELETE",
    });
  }
}

// Export singleton instance
export const medicalNotesClient = new MedicalNotesClient();

// Export individual functions for backward compatibility
export const getMedicalNotesByUser = () => medicalNotesClient.getMedicalNotesByUser();
export const getMedicalNoteById = (caseId: string) => medicalNotesClient.getMedicalNoteById(caseId);
export const createMedicalNote = (caseData: CreateMedicalNoteData) => medicalNotesClient.createMedicalNote(caseData);
export const updateMedicalNote = (noteId: string, updateData: UpdateMedicalNoteData) => medicalNotesClient.updateMedicalNote(noteId, updateData);
export const deleteMedicalNote = (noteId: string) => medicalNotesClient.deleteMedicalNote(noteId);
