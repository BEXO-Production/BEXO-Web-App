import { Share } from "react-native";
import * as Haptics from "expo-haptics";

/** Opens the OS share sheet for a published profile — used by every
 * "Share" affordance (Home's card actions, Profile's header). No-ops with
 * an alert-free early return when there's no handle yet, since there's
 * nothing live to share. */
export async function shareProfile(handle: string | null | undefined, name?: string | null) {
  if (!handle) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  const url = `https://${handle}.atbexo.com`;
  try {
    await Share.share({
      message: name ? `${name} on BEXO — ${url}` : url,
      url,
    });
  } catch {
    // User dismissed the share sheet, or the OS share call failed —
    // either way there's nothing actionable to surface here.
  }
}
