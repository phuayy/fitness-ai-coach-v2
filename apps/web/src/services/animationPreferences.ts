import { getSupabaseClient } from "../lib/supabaseClient";

export interface UserAnimationPreferences {
  animationsEnabled: boolean;
}

interface UserPreferencesRow {
  user_id: string;
  animations_enabled: boolean;
}

interface AnimationImpressionRow {
  id: string;
}

export async function getUserAnimationPreferences(
  userId: string
): Promise<UserAnimationPreferences> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("user_preferences")
    .select("user_id, animations_enabled")
    .eq("user_id", userId)
    .limit(1)
    .returns<UserPreferencesRow[]>();

  if (error) throw error;

  return {
    animationsEnabled: data[0]?.animations_enabled ?? true
  };
}

export async function upsertUserAnimationPreferences(
  userId: string,
  preferences: UserAnimationPreferences
): Promise<UserAnimationPreferences> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("user_preferences")
    .upsert(
      {
        user_id: userId,
        animations_enabled: preferences.animationsEnabled
      },
      { onConflict: "user_id" }
    )
    .select("user_id, animations_enabled")
    .single<UserPreferencesRow>();

  if (error) throw error;

  return {
    animationsEnabled: data.animations_enabled
  };
}

export async function hasAnimationImpression(
  userId: string,
  triggerKey: string,
  shownOn: string
): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("animation_impressions")
    .select("id")
    .eq("user_id", userId)
    .eq("trigger_key", triggerKey)
    .eq("shown_on", shownOn)
    .limit(1)
    .returns<AnimationImpressionRow[]>();

  if (error) throw error;

  return data.length > 0;
}

export async function recordAnimationImpression(
  userId: string,
  triggerKey: string,
  shownOn: string,
  context: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("animation_impressions").upsert(
    {
      user_id: userId,
      trigger_key: triggerKey,
      shown_on: shownOn,
      context_json: context
    },
    { onConflict: "user_id,trigger_key,shown_on" }
  );

  if (error) throw error;
}
