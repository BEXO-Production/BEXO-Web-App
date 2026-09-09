import "../global.css";
import { useEffect } from "react";
import { LogBox, View } from "react-native";
import { Stack, type ErrorBoundaryProps } from "expo-router";
import { ReducedMotionConfig, ReduceMotion } from "react-native-reanimated";
import { StatusBar } from "expo-status-bar";
import { QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { fontMap } from "@/lib/fonts";
import { configureApiClient } from "@/lib/api-client";
import { queryClient } from "@/lib/query-client";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider, useTheme } from "@/lib/theme-context";
import { OverlayProvider } from "@/lib/overlay-context";
import { CardDesignProvider } from "@/lib/card-design-store";
import { ErrorState } from "@/components/ErrorState";
import { Msg91OtpBridge } from "@/components/Msg91OtpBridge";

SplashScreen.preventAutoHideAsync().catch(() => {});

// Fires purely from `moti`'s own internals (moti/build/components/safe-area-view.js
// imports RN's deprecated SafeAreaView at module scope) the instant anything
// imports MotiView — before our code even runs, and regardless of the fact
// that we never use Moti's SafeAreaView. Every SafeAreaView actually used in
// this app (Screen.tsx) already comes from react-native-safe-area-context;
// tried patching around moti's own barrel export first (importing its
// components/view.js file directly to dodge the safe-area-view import), but
// moti's package.json `exports` map doesn't expose that subpath, so Metro's
// package-exports resolution rejects it outright — not fixable from our
// side without forking moti. Suppressing the message is the correct fix
// here, not a cover-up: it's not our own code, and it can't be reached by
// upgrading how we call moti — only by moti's maintainers changing that
// internal import.
LogBox.ignoreLogs(["SafeAreaView has been deprecated"]);

/**
 * expo-router renders this instead of a white screen when any screen below
 * throws during render. `retry` remounts the subtree.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <SafeAreaProvider>
      <View className="flex-1 bg-paper">
        <ErrorState error={error} onRetry={retry} />
      </View>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts(fontMap);

  useEffect(() => {
    configureApiClient();
  }, []);

  useEffect(() => {
    // Hold the native splash until the Playfair/Jakarta faces are ready, so the
    // first frame is never the system font swapping under the user.
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Honours the OS "Reduce Motion" switch for every Reanimated animation
          in the app, mirroring the canvas's prefers-reduced-motion rule. */}
      <ReducedMotionConfig mode={ReduceMotion.System} />
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AuthProvider>
              <CardDesignProvider>
                <OverlayProvider>
                  <ThemedApp />
                </OverlayProvider>
              </CardDesignProvider>
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Status bar icons and root background flip with the in-app dark-mode switch. */
function ThemedApp() {
  const { dark, c } = useTheme();

  return (
    <>
      <StatusBar style={dark ? "light" : "dark"} />
      <Msg91OtpBridge />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "none",
          contentStyle: { backgroundColor: c.paper },
        }}
      />
    </>
  );
}
