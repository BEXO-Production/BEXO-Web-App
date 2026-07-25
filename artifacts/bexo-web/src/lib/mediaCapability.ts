/**
 * Adaptive media capability — keep login / onboarding smooth on older phones.
 * Prefer a static cinematic still over full-bleed looping video when the device
 * is unlikely to decode + composite it at a stable frame rate.
 */

export type MediaCapability = {
  /** Full-bleed looping background video (auth / marketing-style) */
  allowVideo: boolean;
  /** Slow Ken Burns pan on still backdrops */
  allowKenBurns: boolean;
  /** Carousels, continuous decorative motion */
  allowHeavyMotion: boolean;
  reason: string;
};

const SKIP_VIDEO_KEY = "bexo_skip_bg_video";
const CAP_CACHE_KEY = "bexo_media_cap_v1";

type NavConnection = {
  saveData?: boolean;
  effectiveType?: string;
  downlink?: number;
};

function connection(): NavConnection | null {
  const nav = navigator as Navigator & {
    connection?: NavConnection;
    mozConnection?: NavConnection;
    webkitConnection?: NavConnection;
  };
  return nav.connection || nav.mozConnection || nav.webkitConnection || null;
}

function isCoarsePointerMobile(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(pointer: coarse)").matches) return true;
  } catch {
    /* ignore */
  }
  return (navigator.maxTouchPoints || 0) > 1 && window.innerWidth < 900;
}

function readForcedSkip(): boolean {
  try {
    return sessionStorage.getItem(SKIP_VIDEO_KEY) === "1";
  } catch {
    return false;
  }
}

/** Persist a runtime decision so we don't keep retrying a laggy video. */
export function persistSkipBackgroundVideo(reason = "runtime-jank"): void {
  try {
    sessionStorage.setItem(SKIP_VIDEO_KEY, "1");
    sessionStorage.setItem(`${SKIP_VIDEO_KEY}_reason`, reason);
  } catch {
    /* ignore */
  }
}

function evaluate(): MediaCapability {
  if (typeof window === "undefined") {
    return {
      allowVideo: false,
      allowKenBurns: false,
      allowHeavyMotion: false,
      reason: "ssr",
    };
  }

  if (readForcedSkip()) {
    return {
      allowVideo: false,
      allowKenBurns: false,
      allowHeavyMotion: true,
      reason: "session-skip",
    };
  }

  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return {
        allowVideo: false,
        allowKenBurns: false,
        allowHeavyMotion: false,
        reason: "reduced-motion",
      };
    }
  } catch {
    /* ignore */
  }

  const conn = connection();
  if (conn?.saveData) {
    return {
      allowVideo: false,
      allowKenBurns: false,
      allowHeavyMotion: true,
      reason: "save-data",
    };
  }

  const effective = (conn?.effectiveType || "").toLowerCase();
  if (effective === "slow-2g" || effective === "2g") {
    return {
      allowVideo: false,
      allowKenBurns: false,
      allowHeavyMotion: true,
      reason: "slow-network",
    };
  }

  // Very constrained downlink (Mbps)
  if (typeof conn?.downlink === "number" && conn.downlink > 0 && conn.downlink < 0.7) {
    return {
      allowVideo: false,
      allowKenBurns: false,
      allowHeavyMotion: true,
      reason: "low-bandwidth",
    };
  }

  const memory =
    typeof (navigator as Navigator & { deviceMemory?: number }).deviceMemory === "number"
      ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory!
      : null;
  const cores = navigator.hardwareConcurrency || null;
  const mobile = isCoarsePointerMobile();

  // Hard low-end: ≤2 GB RAM or dual-core class devices
  if ((memory !== null && memory <= 2) || (cores !== null && cores <= 2)) {
    return {
      allowVideo: false,
      allowKenBurns: false,
      allowHeavyMotion: false,
      reason: "low-end-hardware",
    };
  }

  // Mid-low phones: video decode + UI glass blur often tanks 60fps
  if (mobile) {
    if (memory !== null && memory <= 4) {
      return {
        allowVideo: false,
        allowKenBurns: false,
        allowHeavyMotion: true,
        reason: "mobile-low-memory",
      };
    }
    // Unknown memory (common on iOS) — be conservative on ≤4 logical cores
    if (memory === null && cores !== null && cores <= 4) {
      return {
        allowVideo: false,
        allowKenBurns: false,
        allowHeavyMotion: true,
        reason: "mobile-low-cores",
      };
    }
    // Default phone path: still UI, no looping video / ken burns (smoother scroll)
    return {
      allowVideo: false,
      allowKenBurns: false,
      allowHeavyMotion: true,
      reason: "mobile-lite",
    };
  }

  return {
    allowVideo: true,
    allowKenBurns: true,
    allowHeavyMotion: true,
    reason: "ok",
  };
}

let cached: MediaCapability | null = null;

export function getMediaCapability(force = false): MediaCapability {
  if (!force && cached) return cached;

  if (!force && typeof window !== "undefined") {
    try {
      const raw = sessionStorage.getItem(CAP_CACHE_KEY);
      if (raw) {
        cached = JSON.parse(raw) as MediaCapability;
        // Re-check forced skip (may have been set after FPS abort)
        if (readForcedSkip()) {
          cached = { ...cached, allowVideo: false, reason: "session-skip" };
        }
        return cached;
      }
    } catch {
      /* ignore */
    }
  }

  cached = evaluate();
  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem(CAP_CACHE_KEY, JSON.stringify(cached));
    } catch {
      /* ignore */
    }
    try {
      document.documentElement.dataset.bexoMotion = cached.allowHeavyMotion
        ? cached.allowKenBurns
          ? "full"
          : "lite"
        : "reduced";
    } catch {
      /* ignore */
    }
  }
  return cached;
}

/**
 * Watch frame timing while a background video plays.
 * If we see sustained jank, tear down and remember for this session.
 */
export function watchPlaybackSmoothness(opts: {
  onJank: () => void;
  /** How long to sample before deciding (ms) */
  sampleMs?: number;
  /** Frame gap (ms) treated as a drop — ~20fps */
  dropThresholdMs?: number;
  /** Consecutive drops before abort */
  dropBudget?: number;
}): () => void {
  const sampleMs = opts.sampleMs ?? 3500;
  const dropThresholdMs = opts.dropThresholdMs ?? 48;
  const dropBudget = opts.dropBudget ?? 14;
  let last = performance.now();
  let drops = 0;
  let started = performance.now();
  let raf = 0;
  let done = false;

  const tick = (now: number) => {
    if (done) return;
    const dt = now - last;
    last = now;
    if (dt > dropThresholdMs) drops += 1;
    else drops = Math.max(0, drops - 1);

    if (drops >= dropBudget) {
      done = true;
      persistSkipBackgroundVideo("fps-jank");
      cached = {
        allowVideo: false,
        allowKenBurns: false,
        allowHeavyMotion: true,
        reason: "fps-jank",
      };
      try {
        sessionStorage.setItem(CAP_CACHE_KEY, JSON.stringify(cached));
        document.documentElement.dataset.bexoMotion = "lite";
      } catch {
        /* ignore */
      }
      opts.onJank();
      return;
    }

    if (now - started < sampleMs) {
      raf = requestAnimationFrame(tick);
    }
  };

  raf = requestAnimationFrame(tick);
  return () => {
    done = true;
    cancelAnimationFrame(raf);
  };
}
