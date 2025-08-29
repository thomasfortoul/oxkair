/**
 * Client-side API service for user profiles
 * Replaces direct pg-service imports in client components
 */

export interface UserProfile {
  id: string;
  user_category?: string;
  verification_status?: string;
  created_at?: string;
  updated_at?: string;
}

export interface UpdateUserProfileData {
  user_category?: string;
  verification_status?: string;
}

class ProfilesClient {
  private async fetchWithAuth(url: string, options: RequestInit = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
      return await this.fetchWithAuth(`/api/profiles/${userId}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  async updateUserProfile(userId: string, profileData: UpdateUserProfileData): Promise<UserProfile> {
    return this.fetchWithAuth(`/api/profiles/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(profileData),
    });
  }
}

// Export singleton instance
export const profilesClient = new ProfilesClient();

// Export individual functions for backward compatibility
export const getUserProfile = (userId: string) => profilesClient.getUserProfile(userId);
export const updateUserProfile = (userId: string, profileData: UpdateUserProfileData) => 
  profilesClient.updateUserProfile(userId, profileData);