import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { RevealText } from "@/components/ui/Motion";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Redirect } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { fonts } from "@/lib/fonts";
import { brand } from "@/lib/theme";
import { Float, LightSweep, PulseRing } from "@/components/ui/Effects";
import { SplashBackgroundVideo } from "@/components/SplashBackgroundVideo";

const POSTER = require("../assets/brand/hero-poster.jpg");
const LOGO = require("../assets/brand/bexo-logo.png");

/**
 * "01 Splash" — the brand beat that opens the app, and the auth gate. It runs
 * for its full 4.2s before handing off: the hero still drifting under a dark
 * vignette, the mark bobbing inside two staggered radar rings, then the
 * wordmark, tagline, and a sweeping progress hairline.
 *
 * The canvas plays a looping video here. This uses the poster with a slow
 * push-in instead: the video needed `expo-video`, a native module that is not
 * in the Expo Go binary, so importing it crashed the app on launch — on the
 * very first screen, every single time. A 9MB clip is also the wrong thing to
 * ship through Metro to a phone. Restore the video in a dev/production build
 * if it earns its place there.
 */
export default function Index() {
  const { status } = useAuth();
  const [held, setHeld] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => setHeld(false), 4200);
    return () => clearTimeout(id);
  }, []);

  if (!held && status === "signedIn") return <Redirect href="/(app)/home" />;
  if (!held && status === "signedOut") return <Redirect href="/(auth)/onboarding" />;

  return <Splash />;
}

function Splash() {
  const drift = useSharedValue(0);

  useEffect(() => {
    drift.value = withRepeat(
      withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [drift]);

  const posterStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(drift.value, [0, 1], [1.06, 1.16]) },
      { translateY: interpolate(drift.value, [0, 1], [6, -6]) },
    ],
  }));

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: brand.night, gap: 24 }}>
      <StatusBar style="light" />

      <Animated.Image
        source={POSTER}
        style={[StyleSheet.absoluteFill, { opacity: 0.9 }, posterStyle]}
        resizeMode="cover"
      />
      <SplashBackgroundVideo style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={["rgba(5,7,15,0.35)", "rgba(5,7,15,0.86)"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0.1 }}
        end={{ x: 0.5, y: 1 }}
      />

      <View style={{ alignItems: "center", justifyContent: "center" }}>
        <PulseRing size={104} color="rgba(155,182,255,0.5)" />
        <PulseRing size={104} color="rgba(155,182,255,0.5)" delay={800} />
        <Float distance={6} duration={1800}>
          <Image source={LOGO} style={{ width: 72, height: 72 }} resizeMode="contain" />
        </Float>
      </View>

      <RevealText
        delay={150} duration={800} y={0}  style={{ fontFamily: fonts.sans700, fontSize: 13, letterSpacing: 8, color: "#fff" }}
      >
        BEXO
      </RevealText>

      <RevealText
        delay={300} duration={900} y={0}  style={{ fontFamily: fonts.serif600Italic, fontSize: 15, color: "rgba(255,255,255,0.66)" }}
      >
        your name, on the web
      </RevealText>

      <View
        style={{
          width: 130,
          height: 2,
          borderRadius: 2,
          backgroundColor: "rgba(255,255,255,0.14)",
          overflow: "hidden",
        }}
      >
        <LightSweep width={130} height={2} duration={1250} delay={0} opacity={1} tint="91,140,255" />
      </View>

      <Text
        style={{
          position: "absolute",
          bottom: 52,
          fontFamily: fonts.sans700,
          fontSize: 9.5,
          letterSpacing: 2.4,
          color: "rgba(255,255,255,0.42)",
        }}
      >
        BY ACE DIGITAL
      </Text>
    </View>
  );
}
