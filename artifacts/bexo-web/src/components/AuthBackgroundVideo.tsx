import React, { useEffect, useRef, useState } from "react";
import { CinematicBackdrop } from "./CinematicBackdrop";
import {
  getMediaCapability,
  persistSkipBackgroundVideo,
  watchPlaybackSmoothness,
} from "../lib/mediaCapability";

const LOCAL_VIDEO = "/assets/auth-background.mp4";
const CDN_VIDEO =
  "https://pub-dea3489e0d644467a9a61d41406280f0.r2.dev/assets/auth-background.mp4";

/**
 * Auth / onboarding atmosphere.
 * Capable devices get a muted looping video; older / constrained phones keep
 * a static cinematic still so OTP + form UI stay responsive.
 */
export function AuthBackgroundVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cap] = useState(() => getMediaCapability());
  const [allowVideo, setAllowVideo] = useState(cap.allowVideo);
  const [videoReady, setVideoReady] = useState(false);
  const [useCdn, setUseCdn] = useState(false);

  useEffect(() => {
    if (!allowVideo) return;

    const el = videoRef.current;
    if (!el) return;

    let cancelled = false;
    let retries = 0;
    let stopWatch: (() => void) | null = null;

    const tearDownVideo = (reason: string) => {
      if (cancelled) return;
      persistSkipBackgroundVideo(reason);
      setAllowVideo(false);
      setVideoReady(false);
      try {
        el.pause();
        el.removeAttribute("src");
        el.load();
      } catch {
        /* ignore */
      }
    };

    const markPlaying = () => {
      if (cancelled || el.paused) return;
      setVideoReady(true);
      if (!stopWatch) {
        stopWatch = watchPlaybackSmoothness({
          onJank: () => tearDownVideo("fps-jank"),
        });
      }
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
        if (retries < 6 && !cancelled) {
          window.setTimeout(() => void tryPlay(), 320 * retries);
        } else if (!cancelled) {
          // Autoplay blocked or decode failed — stay on still.
          tearDownVideo("play-failed");
        }
      }
    };

    const onReady = () => {
      void tryPlay();
    };

    const onError = () => {
      if (!useCdn) setUseCdn(true);
      else tearDownVideo("media-error");
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void tryPlay();
      else {
        try {
          el.pause();
        } catch {
          /* ignore */
        }
      }
    };

    el.addEventListener("playing", markPlaying);
    el.addEventListener("canplay", onReady);
    el.addEventListener("loadeddata", onReady);
    el.addEventListener("error", onError);
    document.addEventListener("visibilitychange", onVisible);

    void tryPlay();

    return () => {
      cancelled = true;
      stopWatch?.();
      el.removeEventListener("playing", markPlaying);
      el.removeEventListener("canplay", onReady);
      el.removeEventListener("loadeddata", onReady);
      el.removeEventListener("error", onError);
      document.removeEventListener("visibilitychange", onVisible);
      try {
        el.pause();
      } catch {
        /* ignore */
      }
    };
  }, [allowVideo, useCdn]);

  const src = useCdn ? CDN_VIDEO : LOCAL_VIDEO;
  const showVideo = allowVideo;

  return (
    <div className="fixed inset-0 z-0 overflow-hidden select-none pointer-events-none bg-[#05070f]">
      <CinematicBackdrop
        atmosphere="auth"
        intensity="soft"
        animate={!videoReady && cap.allowKenBurns}
        className={`!absolute transition-opacity duration-700 ${
          videoReady ? "opacity-0" : "opacity-100"
        }`}
      />

      {showVideo && (
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
          preload="metadata"
          aria-hidden
        />
      )}

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,_rgba(47,107,255,0.16)_0%,_transparent_48%),radial-gradient(ellipse_at_85%_90%,_rgba(37,88,224,0.12)_0%,_transparent_42%)]" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#05070f]/78 via-[#05070f]/25 to-[#05070f]/40" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_20%,_rgba(5,7,15,0.45)_100%)]" />
      <div className="absolute inset-0 opacity-[0.05] mix-blend-overlay bexo-film-grain" />
    </div>
  );
}
