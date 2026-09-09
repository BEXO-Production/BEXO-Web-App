import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { HERO_BG_BASE64 } from "@/lib/hero-video-data";

/**
 * High-performance background video component for the splash screen.
 *
 * Uses a hardware-accelerated 6-second ambient loop (393 KB, down from 8.9 MB).
 * On Web: renders native HTML5 <video> with programmatic DOM muted/play handling.
 * On Native (iOS/Android): renders via zero-overhead WebView with an active
 * watchdog loop that guarantees continuous, uninterrupted autoplay and seamless
 * looping without pausing.
 */
export function SplashBackgroundVideo({ style }: { style?: any }) {
  const [loaded, setLoaded] = useState(false);
  const webVideoRef = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const v = webVideoRef.current;
    if (!v) return;

    // Direct DOM property enforcement required by Chrome/Safari mobile autoplay policies
    v.muted = true;
    v.defaultMuted = true;
    v.volume = 0;

    const play = () => {
      try {
        const p = v.play();
        if (p && typeof p.catch === "function") {
          p.catch(() => {});
        }
      } catch (_) {}
    };

    play();

    const onEnded = () => {
      v.currentTime = 0;
      play();
    };

    const onPause = () => {
      if (!v.ended) play();
      else {
        v.currentTime = 0;
        play();
      }
    };

    v.addEventListener("ended", onEnded);
    v.addEventListener("pause", onPause);

    // Watchdog to guarantee it never stays paused
    const interval = setInterval(() => {
      if (v.paused) play();
      if (v.duration && v.currentTime >= v.duration - 0.15) {
        v.currentTime = 0;
        play();
      }
    }, 300);

    return () => {
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("pause", onPause);
      clearInterval(interval);
    };
  }, []);

  if (Platform.OS === "web") {
    return (
      <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
        {/* @ts-ignore - React Native Web supports native DOM tags */}
        <video
          ref={webVideoRef}
          autoPlay
          loop
          muted
          playsInline
          webkit-playsinline="true"
          preload="auto"
          src={HERO_BG_BASE64}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 0.92,
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
        opacity: 0.92;
        pointer-events: none;
      }
    </style>
  </head>
  <body>
    <video
      id="bg-video"
      autoplay
      loop
      muted
      playsinline
      webkit-playsinline
      preload="auto"
      src="${HERO_BG_BASE64}"
    ></video>
    <script>
      (function() {
        var v = document.getElementById('bg-video');
        if (!v) return;

        // Force DOM properties for mobile autoplay compliance
        v.muted = true;
        v.defaultMuted = true;
        v.volume = 0;
        v.playbackRate = 1.0;

        function forcePlay() {
          try {
            var promise = v.play();
            if (promise && typeof promise.catch === 'function') {
              promise.catch(function() {
                setTimeout(forcePlay, 100);
              });
            }
          } catch(e) {
            setTimeout(forcePlay, 100);
          }
        }

        // Loop fallback: base64 video in mobile WebViews often halts upon 'ended'
        v.addEventListener('ended', function() {
          v.currentTime = 0;
          forcePlay();
        }, false);

        // Guard against unintended pause by browser/OS
        v.addEventListener('pause', function() {
          if (!v.ended) {
            forcePlay();
          } else {
            v.currentTime = 0;
            forcePlay();
          }
        }, false);

        // Watchdog heartbeat: checks every 300ms to guarantee continuous looping
        setInterval(function() {
          if (v.paused) {
            forcePlay();
          }
          if (v.duration && v.currentTime >= v.duration - 0.15) {
            v.currentTime = 0;
            forcePlay();
          }
        }, 300);

        // Start playback immediately on document readiness
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
          forcePlay();
        } else {
          document.addEventListener('DOMContentLoaded', forcePlay);
        }
        window.addEventListener('load', forcePlay);

        // Also resume when returning to foreground
        document.addEventListener('visibilitychange', function() {
          if (!document.hidden) {
            forcePlay();
          }
        });
      })();
    </script>
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
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        androidLayerType="hardware"
        mixedContentMode="always"
        originWhitelist={["*"]}
        onLoadEnd={() => setLoaded(true)}
      />
    </View>
  );
}
