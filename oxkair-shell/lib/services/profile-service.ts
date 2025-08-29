import { query, withTransaction } from "@/lib/db/pg-service";
import type { NormalizedUser } from "@/lib/auth/entra-utils";

// Helper function to validate UUID format
function isValidUUID(uuid: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

export interface ProfileData {
  id: string; // This is the Azure OID
  email?: string;
  name?: string;
  user_category?: string;
  npi?: string;
  recovery_email?: string;
  phone_number?: string;
  verification_status?: string;
  institution_id?: string;
  created_at?: Date;
  updated_at?: Date;
}

export class ProfileService {
  /**
   * Find or create a profile for the authenticated user using Azure OID as the primary key
   * This replaces the complex dual-ID logic with a simple idempotent upsert
   */
  async findOrCreateProfile(
    user: NormalizedUser,
  ): Promise<{ profile: ProfileData }> {
    console.log("[ProfileService] Finding/creating profile for user with OID:", user.oid?.substring(0, 8) + "...");
    
    if (!user.oid) {
      throw new Error("Missing user OID - cannot create profile without canonical identifier");
    }
    
    // OID is sufficient for all operations
    if (!isValidUUID(user.oid)) {
      throw new Error("Invalid user OID format - must be a valid UUID");
    }
    
    try {
      return await withTransaction(async (client) => {
        // Upsert profile with id = oid
        const profileResult = await client.query(
          `INSERT INTO public.profiles (
            id, email, name, user_category, verification_status, created_at, updated_at
          ) VALUES ($1, $2, $3, 'coder', 'verified', NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email,
            name = EXCLUDED.name,
            updated_at = NOW()
          RETURNING *`,
          [
            user.oid,
            user.email,
            user.name || "User", // Use name, then email as fallback
          ],
        );
        
        const profile = profileResult.rows[0];
        console.log("[ProfileService] Profile upserted:", {
          id: profile.id?.substring(0, 8) + "...",
          email: profile.email,
          isNew: profile.created_at === profile.updated_at,
        });
        
        // Ensure user_settings exists
        await client.query(
          `INSERT INTO public.user_settings (id, theme, created_at, updated_at)
           VALUES ($1, 'light', NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          [user.oid],
        );
        
        console.log("[ProfileService] User settings ensured for OID");
        
        return { profile };
      });
    } catch (error) {
      console.error("[ProfileService] Transaction failed:", {
        error: error,
        message: error instanceof Error ? error.message : String(error),
        oid: user.oid?.substring(0, 8) + "...",
      });
      throw error;
    }
  }

  /**
   * Get profile by OID
   */
  async getProfileById(profileId: string): Promise<ProfileData | null> {
    if (!isValidUUID(profileId)) {
      throw new Error("Invalid profile ID format - must be a valid UUID");
    }

    const result = await query("SELECT * FROM public.profiles WHERE id = $1", [
      profileId,
    ]);

    return result.rows[0] || null;
  }

  /**
   * Update profile by OID
   */
  async updateProfile(
    profileId: string,
    updates: Partial<ProfileData>,
  ): Promise<ProfileData> {
    if (!isValidUUID(profileId)) {
      throw new Error("Invalid profile ID format - must be a valid UUID");
    }

    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    // Build dynamic update query
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined && key !== "id" && key !== "created_at") {
        updateFields.push(`${key} = $${paramIndex}`);
        updateValues.push(value);
        paramIndex++;
      }
    });

    if (updateFields.length === 0) {
      throw new Error("No fields to update");
    }

    updateFields.push("updated_at = NOW()");
    updateValues.push(profileId);

    const result = await query(
      `UPDATE public.profiles SET ${updateFields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      updateValues,
    );

    if (result.rows.length === 0) {
      throw new Error("Profile not found");
    }

    return result.rows[0];
  }

  /**
   * Get user settings by OID
   */
  async getUserSettings(profileId: string): Promise<{ theme: string } | null> {
    if (!isValidUUID(profileId)) {
      throw new Error("Invalid profile ID format - must be a valid UUID");
    }

    const result = await query(
      "SELECT theme FROM public.user_settings WHERE id = $1",
      [profileId],
    );

    return result.rows[0] || null;
  }

  /**
   * Update user settings by OID
   */
  async updateUserSettings(
    profileId: string,
    settings: { theme?: string },
  ): Promise<void> {
    if (!isValidUUID(profileId)) {
      throw new Error("Invalid profile ID format - must be a valid UUID");
    }

    await query(
      `INSERT INTO public.user_settings (id, theme, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         theme = EXCLUDED.theme,
         updated_at = NOW()`,
      [profileId, settings.theme || "light"],
    );
  }
}
