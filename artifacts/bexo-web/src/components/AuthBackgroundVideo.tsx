import React, { useCallback, useEffect, useRef, useState } from "react";

/** Same-origin first (no CORS). CDN fallback for production deploys without a local copy. */
const LOCAL_VIDEO_URL = "/assets/auth-background.mp4";
const R2_VIDEO_URL =
  "https://pub-dea3489e0d644467a9a61d41406280f0.r2.dev/assets/auth-background.mp4";

const SOURCES = [LOCAL_VIDEO_URL, R2_VIDEO_URL] as const;

/**
 * Full-bleed muted loop behind auth screens.
 * Must stay muted + playsInline for Safari/Chrome autoplay policies.
 */
export function AuthBackgroundVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const videoSrc = SOURCES[Math.min(sourceIndex, SOURCES.length - 1)];

  const tryPlay = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute("muted", "");
    video.playsInline = true;

    try {
      await video.play();
      setIsReady(true);
    } catch (err) {
      console.warn("[AuthBackgroundVideo] autoplay blocked or failed:", err);
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setIsReady(false);

    const onCanPlay = () => {
      void tryPlay();
    };
    const onPlaying = () => setIsReady(true);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void tryPlay();
    };

    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("playing", onPlaying);
    document.addEventListener("visibilitychange", onVisibility);

    void tryPlay();
    const retry = window.setTimeout(() => void tryPlay(), 350);

    return () => {
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("playing", onPlaying);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(retry);
    };
  }, [videoSrc, tryPlay]);

  useEffect(() => {
    const unlock = () => {
      void tryPlay();
    };
    window.addEventListener("pointerdown", unlock, { once: true, passive: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [tryPlay]);

  const advanceSource = () => {
    setSourceIndex((i) => (i + 1 < SOURCES.length ? i + 1 : i));
  };

  return (
    <div className="fixed inset-0 z-0 overflow-hidden select-none pointer-events-none bg-slate-950">
      <video
        ref={videoRef}
        key={videoSrc}
        src={videoSrc}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        disableRemotePlayback
        className={`absolute inset-0 h-full w-full object-cover scale-105 transition-opacity duration-700 ${
          isReady ? "opacity-100" : "opacity-0"
        }`}
        onError={advanceSource}
      />

      {/* Keep type readable while letting the footage read as motion, not flat black */}
      <div className="absolute inset-0 bg-slate-950/25" />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-slate-950/35" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_25%,_rgba(2,6,23,0.35)_100%)]" />
    </div>
  );
}
