import { useEffect } from "react";
import { useProfile } from "@/lib/use-profile";
import { useCardDesign } from "@/lib/card-design-store";

/**
 * Pulls the server's saved card design into the local store once, the first
 * time a profile loads after app start — so a card customised on one device
 * shows up the same way after reinstalling or switching phones, instead of
 * silently resetting to the defaults.
 */
export function useCardDesignSync() {
  const { data } = useProfile();
  const { hydrate } = useCardDesign();

  useEffect(() => {
    if (!data?.profile?.cardDesign) return;
    const remote = data.profile.cardDesign;
    const patch: Record<string, unknown> = { skinId: remote.background, fontId: remote.font };
    if (remote.accent) patch.accentId = remote.accent;
    if (remote.headline) patch.headlineId = remote.headline;
    if (remote.photoShape) patch.photoShape = remote.photoShape;
    if (remote.photoUrl !== undefined) patch.photoUrl = remote.photoUrl;
    if (remote.fields) patch.fields = remote.fields;
    hydrate(patch as never);
  }, [data?.profile?.cardDesign, hydrate]);
}
