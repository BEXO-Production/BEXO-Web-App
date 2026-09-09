import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";

const HERO_VIDEO = require("../../assets/brand/hero-bg.mp4");

/**
 * Native hardware-accelerated background video for the splash screen.
 *
 * Uses `expo-video` (ExoPlayer on Android, AVPlayer on iOS, native HTML5 on Web).
 * - `loop = true`: seamless continuous looping with zero hitch.
 * - `muted = true`: prevents taking audio focus or triggering system notification media sessions.
 * - `nativeControls = false`: completely hides playback controls, eliminate any "Paused" UI overlay.
 * - `contentFit = "cover"`: smooth edge-to-edge wallpaper scaling.
 */
export function SplashBackgroundVideo({ style }: { style?: any }) {
  const player = useVideoPlayer(HERO_VIDEO, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  useEffect(() => {
    if (player) {
      player.loop = true;
      player.muted = true;
      player.play();
    }
  }, [player]);

  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
      />
    </View>
  );
}
