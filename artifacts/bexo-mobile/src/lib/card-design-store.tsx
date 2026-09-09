import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_CARD_FIELDS, type CardFields, type CardPhotoShape } from "@/lib/design-data";
import { DEFAULT_FONT_ID, DEFAULT_SKIN_ID } from "@/lib/card-design";

/**
 * The card's look, shared by Home, Card Studio, Card Share and Celebrate.
 *
 * Finish and typeface round-trip through the profile API (`cardDesign`); the
 * accent, back headline and per-field toggles have no server field yet, so
 * they live on the device — the card still renders identically everywhere in
 * the app, and nothing is silently lost between launches.
 */
export type CardDesignState = {
  skinId: string;
  fontId: string;
  accentId: string;
  headlineId: string;
  fields: CardFields;
  /** How the picture is cut on the card. */
  photoShape: CardPhotoShape;
  /** A picture or logo chosen for the card, overriding the profile photo. */
  photoUrl: string | null;
};

export const DEFAULT_CARD_DESIGN: CardDesignState = {
  skinId: DEFAULT_SKIN_ID,
  fontId: DEFAULT_FONT_ID,
  accentId: "auto",
  headlineId: "network",
  fields: DEFAULT_CARD_FIELDS,
  photoShape: "circle",
  photoUrl: null,
};

type Value = {
  design: CardDesignState;
  setDesign: (patch: Partial<CardDesignState>) => void;
  toggleField: (key: keyof CardFields) => void;
  /** Adopt the design stored on the server, without clobbering a local edit. */
  hydrate: (remote: Partial<CardDesignState> | null | undefined) => void;
  reset: () => void;
};

const STORAGE_KEY = "bexo.card-design.v1";

const CardDesignContext = createContext<Value>({
  design: DEFAULT_CARD_DESIGN,
  setDesign: () => {},
  toggleField: () => {},
  hydrate: () => {},
  reset: () => {},
});

export function CardDesignProvider({ children }: { children: React.ReactNode }) {
  const [design, setState] = useState<CardDesignState>(DEFAULT_CARD_DESIGN);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setState((prev) => ({ ...prev, ...JSON.parse(raw) }));
      })
      .catch(() => {});
  }, []);

  const persist = useCallback((next: CardDesignState) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
    return next;
  }, []);

  const setDesign = useCallback(
    (patch: Partial<CardDesignState>) => setState((prev) => persist({ ...prev, ...patch })),
    [persist],
  );

  const toggleField = useCallback(
    (key: keyof CardFields) =>
      setState((prev) => persist({ ...prev, fields: { ...prev.fields, [key]: !prev.fields[key] } })),
    [persist],
  );

  const hydratedOnce = useRef(false);
  const hydrate = useCallback(
    (remote: Partial<CardDesignState> | null | undefined) => {
      if (!remote || hydratedOnce.current) return;
      hydratedOnce.current = true;
      setState((prev) => persist({ ...prev, ...remote }));
    },
    [persist],
  );

  const reset = useCallback(() => setState(persist(DEFAULT_CARD_DESIGN)), [persist]);

  const value = useMemo<Value>(
    () => ({ design, setDesign, toggleField, hydrate, reset }),
    [design, setDesign, toggleField, hydrate, reset],
  );

  return <CardDesignContext.Provider value={value}>{children}</CardDesignContext.Provider>;
}

export function useCardDesign() {
  return useContext(CardDesignContext);
}
