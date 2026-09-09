import { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { HERO_BG_BASE64 } from "@/lib/hero-video-data";

/**
 * High-performance background video component for the splash screen.
 *
 * Uses a hardware-accelerated 6-second ambient loop (393 KB, down from 8.9 MB).
 * On Web: renders native HTML5 <video> directly into the DOM.
 * On Native (iOS/Android): renders via zero-overhead WebView using the local
 * base64 data URI, bypassing Expo Go native module limitations while
 * leveraging Apple/Android GPU video decoders with zero network latency.
 */
export function SplashBackgroundVideo({ style }: { style?: any }) {
  const [loaded, setLoaded] = useState(false);

  if (Platform.OS === "web") {
    return (
      <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
        {/* @ts-ignore - React Native Web supports native DOM tags */}
        <video
          autoPlay
          loop
          muted
          playsInline
          src={HERO_BG_BASE64}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 0.88,
          }}
        />
      </View>
    );
  }

  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body {
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: transparent;
      }
      video {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: 0.88;
      }
    </style>
  </head>
  <body>
    <video autoplay loop muted playsinline webkit-playsinline src="${HERO_BG_BASE64}"></video>
  </body>
</html>`;

  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <WebView
        source={{ html }}
        style={{ backgroundColor: "transparent" }}
        containerStyle={{ backgroundColor: "transparent" }}
        pointerEvents="none"
        scrollEnabled={false}
        bounces={false}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        originWhitelist={["*"]}
        onLoadEnd={() => setLoaded(true)}
      />
    </View>
  );
}
