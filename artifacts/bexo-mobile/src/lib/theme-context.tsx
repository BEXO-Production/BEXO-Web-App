import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  darkColors,
  lightColors,
  shadows as buildShadows,
  type Palette,
  type ShadowStyle,
} from "@/lib/theme";

/**
 * Appearance. Dark mode is a real user setting; the design canvas also carried
 * switches for faking offline/loading/empty states, and those are gone — the
 * screens show whatever the API actually returns, so there is nothing left to
 * simulate.
 */
type ThemeValue = {
  dark: boolean;
  c: Palette;
  shadow: Record<"low" | "card" | "float", ShadowStyle>;
  toggleDark: () => void;
};

const STORAGE_KEY = "bexo.appearance.v2";

const ThemeContext = createContext<ThemeValue>({
  dark: false,
  c: lightColors,
  shadow: buildShadows(false),
  toggleDark: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => setDark(raw === "dark"))
      .catch(() => {});
  }, []);

  const toggleDark = useCallback(() => {
    setDark((prev) => {
      const next = !prev;
      AsyncStorage.setItem(STORAGE_KEY, next ? "dark" : "light").catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<ThemeValue>(
    () => ({
      dark,
      c: dark ? darkColors : lightColors,
      shadow: buildShadows(dark),
      toggleDark,
    }),
    [dark, toggleDark],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
