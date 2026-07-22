import React from "react";
import { cn } from "../design-system/primitives";

/** Shared frosted-glass shell for auth screens over the cinematic video. */
export function AuthGlassCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative isolate", className)}>
      {/* Soft brand glow behind the panel */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-8 -z-10 rounded-[2.5rem] bg-[radial-gradient(ellipse_at_center,_rgba(56,189,248,0.32)_0%,_transparent_68%)] blur-2xl opacity-90"
      />
      <div
        className={cn(
          "relative overflow-hidden rounded-[1.75rem] sm:rounded-[2rem]",
          "border border-white/35",
          "bg-white/[0.16] text-white",
          "shadow-[0_20px_60px_-20px_rgba(0,0,0,0.55),inset_0_1px_0_0_rgba(255,255,255,0.45),inset_0_0_0_1px_rgba(255,255,255,0.08)]",
          "backdrop-blur-[28px] backdrop-saturate-150",
          "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit]",
          "before:bg-gradient-to-br before:from-white/35 before:via-white/[0.06] before:to-cyan-200/5",
          "after:pointer-events-none after:absolute after:inset-x-6 after:top-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-white/70 after:to-transparent",
        )}
      >
        <div className="relative z-10 p-5 sm:p-8">{children}</div>
      </div>
    </div>
  );
}

export const authFieldClass =
  "h-13 rounded-2xl border border-white/30 bg-white/[0.14] text-white text-base font-medium tracking-wide placeholder:text-white/45 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22)] backdrop-blur-md transition-[border-color,box-shadow,background-color] duration-200 ease-out focus:border-indigo-200/80 focus:bg-white/[0.2] focus:ring-2 focus:ring-indigo-300/35 focus:outline-none";

export const authOtpClass =
  "h-12 sm:h-14 min-w-0 w-full text-center text-lg sm:text-xl font-bold rounded-2xl border border-white/30 bg-white/[0.16] text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22)] backdrop-blur-md transition-[border-color,box-shadow,background-color,transform] duration-200 ease-out focus:border-indigo-200/90 focus:bg-white/[0.24] focus:ring-2 focus:ring-indigo-300/40 focus:outline-none focus:scale-[1.04]";

export const authPrimaryBtnClass =
  "w-full min-h-12 h-13 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 cursor-pointer disabled:opacity-45 disabled:pointer-events-none bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500 shadow-[0_12px_36px_-10px_rgba(56,189,248,0.55)] transition-[transform,box-shadow,filter] duration-200 ease-out hover:brightness-110 hover:shadow-[0_16px_44px_-10px_rgba(56,189,248,0.7)] active:scale-[0.985]";

export const authGhostLinkClass =
  "text-xs font-bold text-sky-200 hover:text-white transition-colors duration-150 ease-out min-h-10 inline-flex items-center";
