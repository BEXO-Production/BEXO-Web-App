import React from "react";
import logo from "../assets/bexo-logo.png";
import { cn } from "../design-system/primitives";

type BrandLogoProps = {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  imgClassName?: string;
  /** Soft cyan glow behind the mark (auth / hero). */
  glow?: boolean;
  alt?: string;
};

const SIZE = {
  xs: { wrap: "h-5 w-5 rounded-md", img: "h-full w-full" },
  sm: { wrap: "h-8 w-8 rounded-lg", img: "h-full w-full" },
  md: { wrap: "h-10 w-10 rounded-xl", img: "h-full w-full" },
  lg: { wrap: "h-14 w-14 rounded-2xl", img: "h-full w-full" },
  xl: { wrap: "h-[4.5rem] w-[4.5rem] sm:h-20 sm:w-20 rounded-2xl", img: "h-full w-full" },
} as const;

/**
 * Canonical BEXO mark — new electric-blue 3D “B”.
 * Clips the square artboard into a soft tile that works on light & dark chrome.
 */
export function BrandLogo({
  size = "md",
  className,
  imgClassName,
  glow = false,
  alt = "BEXO",
}: BrandLogoProps) {
  const s = SIZE[size];
  return (
    <div className={cn("relative inline-flex shrink-0", className)}>
      {glow && (
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-3 rounded-[1.35rem] bg-[radial-gradient(circle,_rgba(56,189,248,0.45)_0%,_transparent_70%)] blur-md"
        />
      )}
      <div
        className={cn(
          "relative overflow-hidden border border-white/15 bg-[#05070f] shadow-[0_8px_28px_-10px_rgba(14,165,233,0.55),inset_0_1px_0_0_rgba(255,255,255,0.12)]",
          s.wrap,
        )}
      >
        <img
          src={logo}
          alt={alt}
          className={cn("object-cover object-center select-none", s.img, imgClassName)}
          draggable={false}
        />
      </div>
    </div>
  );
}
