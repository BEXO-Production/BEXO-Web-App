import React from "react";
import { cn } from "../design-system/primitives";

export type AtmosphereKey =
  | "auth"
  | "verify"
  | "account"
  | "profile"
  | "craft"
  | "publish";

const ATMOSPHERE: Record<AtmosphereKey, { src: string; credit: string }> = {
  auth: {
    src: "/assets/atmosphere/auth-deep.jpg",
    credit: "Unsplash — alpine night sky",
  },
  verify: {
    src: "/assets/atmosphere/step-verify.jpg",
    credit: "Unsplash — color wash",
  },
  account: {
    src: "/assets/atmosphere/step-account.jpg",
    credit: "Unsplash — earth from orbit",
  },
  profile: {
    src: "/assets/atmosphere/step-profile.jpg",
    credit: "Unsplash — modern workspace",
  },
  craft: {
    src: "/assets/atmosphere/step-craft.jpg",
    credit: "Unsplash — soft abstract forms",
  },
  publish: {
    src: "/assets/atmosphere/step-publish.jpg",
    credit: "Unsplash — city architecture",
  },
};

export function atmosphereForStep(step: number): AtmosphereKey {
  if (step <= 1) return "verify";
  if (step === 2) return "account";
  if (step <= 4) return "profile";
  if (step <= 6) return "craft";
  return "publish";
}

type Props = {
  atmosphere?: AtmosphereKey;
  className?: string;
  /** Darker bottom wash for forms sitting low on mobile */
  intensity?: "soft" | "rich" | "ink";
  /** Animate a slow Ken Burns drift */
  animate?: boolean;
};

/**
 * Full-bleed cinematic still — sourced Unsplash backgrounds with
 * brand-tinted washes. Prefer this on mobile over heavy video.
 */
export function CinematicBackdrop({
  atmosphere = "auth",
  className,
  intensity = "rich",
  animate = true,
}: Props) {
  const shot = ATMOSPHERE[atmosphere];

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden select-none bg-[#05070f]",
        className,
      )}
      aria-hidden
    >
      <img
        src={shot.src}
        alt=""
        className={cn(
          "absolute inset-0 h-full w-full object-cover",
          animate && "bexo-ken-burns",
        )}
        decoding="async"
        fetchPriority="high"
      />

      {/* Brand mesh — cyan / indigo matching the BEXO mark */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,_rgba(56,189,248,0.18)_0%,_transparent_48%),radial-gradient(ellipse_at_90%_80%,_rgba(59,130,246,0.14)_0%,_transparent_42%)]" />

      {intensity === "soft" && (
        <>
          <div className="absolute inset-0 bg-[#05070f]/15" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#05070f]/72 via-[#05070f]/12 to-[#05070f]/28" />
        </>
      )}
      {intensity === "rich" && (
        <>
          <div className="absolute inset-0 bg-[#05070f]/28" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#05070f]/85 via-[#05070f]/20 to-[#05070f]/40" />
        </>
      )}
      {intensity === "ink" && (
        <>
          <div className="absolute inset-0 bg-[#05070f]/35" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#05070f]/30 via-[#05070f]/25 to-[#05070f]/88" />
        </>
      )}

      {/* Film grain */}
      <div className="absolute inset-0 opacity-[0.07] mix-blend-overlay bexo-film-grain" />
    </div>
  );
}
