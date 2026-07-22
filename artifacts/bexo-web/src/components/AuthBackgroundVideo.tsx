import React, { useEffect, useRef, useState } from "react";
import { CinematicBackdrop } from "./CinematicBackdrop";

const LOCAL_VIDEO = "/assets/auth-background.mp4";
const CDN_VIDEO =
  "https://pub-dea3489e0d644467a9a61d41406280f0.r2.dev/assets/auth-background.mp4";

/**
 * Auth atmosphere: cinematic looping video with Unsplash poster fallback.
 * Still paints instantly; video fades in once playback actually starts.
 */
export function AuthBackgroundVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [useCdn, setUseCdn] = useState(false);
  const preferReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (preferReducedMotion) return;

    const el = videoRef.current;
    if (!el) return;

    let cancelled = false;
    let retries = 0;

    const markPlaying = () => {
      if (!cancelled && !el.paused) setVideoReady(true);
    };

    const tryPlay = async () => {
      if (cancelled || !el) return;
      try {
        el.muted = true;
        el.defaultMuted = true;
        el.setAttribute("muted", "");
        el.playsInline = true;
        el.setAttribute("playsinline", "");
        el.setAttribute("webkit-playsinline", "");
        const p = el.play();
        if (p !== undefined) await p;
        markPlaying();
      } catch {
        retries += 1;
        if (retries < 8 && !cancelled) {
          window.setTimeout(() => void tryPlay(), 280 * retries);
        }
      }
    };

    const onReady = () => {
      void tryPlay();
    };

    const onError = () => {
      if (!useCdn) setUseCdn(true);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void tryPlay();
    };

    el.addEventListener("playing", markPlaying);
    el.addEventListener("canplay", onReady);
    el.addEventListener("loadeddata", onReady);
    el.addEventListener("error", onError);
    document.addEventListener("visibilitychange", onVisible);

    void tryPlay();
    const kick = window.setInterval(() => {
      if (cancelled || (!el.paused && el.readyState >= 2)) {
        window.clearInterval(kick);
        markPlaying();
        return;
      }
      void tryPlay();
    }, 900);

    return () => {
      cancelled = true;
      window.clearInterval(kick);
      el.removeEventListener("playing", markPlaying);
      el.removeEventListener("canplay", onReady);
      el.removeEventListener("loadeddata", onReady);
      el.removeEventListener("error", onError);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [preferReducedMotion, useCdn]);

  const src = useCdn ? CDN_VIDEO : LOCAL_VIDEO;

  return (
    <div className="fixed inset-0 z-0 overflow-hidden select-none pointer-events-none bg-[#05070f]">
      <CinematicBackdrop
        atmosphere="auth"
        intensity="soft"
        animate={!videoReady}
        className={`!absolute transition-opacity duration-700 ${
          videoReady ? "opacity-0" : "opacity-100"
        }`}
      />

      {!preferReducedMotion && (
        <video
          key={src}
          ref={videoRef}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1.1s] ease-out ${
            videoReady ? "opacity-100" : "opacity-0"
          }`}
          src={src}
          poster="/assets/atmosphere/auth-deep.jpg"
          muted
          loop
          playsInline
          autoPlay
          preload="auto"
          aria-hidden
        />
      )}

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,_rgba(56,189,248,0.16)_0%,_transparent_48%),radial-gradient(ellipse_at_85%_90%,_rgba(99,102,241,0.14)_0%,_transparent_42%)]" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#05070f]/78 via-[#05070f]/25 to-[#05070f]/40" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_20%,_rgba(5,7,15,0.45)_100%)]" />
      <div className="absolute inset-0 opacity-[0.05] mix-blend-overlay bexo-film-grain" />
    </div>
  );
}
