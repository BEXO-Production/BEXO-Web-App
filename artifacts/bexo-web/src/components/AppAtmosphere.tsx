import { cn } from "../design-system/primitives";

type Props = {
  className?: string;
  /** Softer wash for dense forms / billing */
  intensity?: "default" | "soft";
};

/**
 * Light product-shell atmosphere — cool paper, sapphire mesh, micro-grid, grain.
 * Keeps the dashboard from reading as flat slate-50 without fighting readability.
 */
export function AppAtmosphere({ className, intensity = "default" }: Props) {
  return (
    <div
      className={cn("bexo-app-atmosphere", intensity === "soft" && "bexo-app-atmosphere--soft", className)}
      aria-hidden
    >
      <div className="bexo-app-atmosphere__base" />
      <div className="bexo-app-atmosphere__mesh" />
      <div className="bexo-app-atmosphere__grid" />
      <div className="bexo-app-atmosphere__orb bexo-app-atmosphere__orb--a" />
      <div className="bexo-app-atmosphere__orb bexo-app-atmosphere__orb--b" />
      <div className="bexo-app-atmosphere__orb bexo-app-atmosphere__orb--c" />
      <div className="bexo-app-atmosphere__vignette" />
      <div className="bexo-app-atmosphere__grain bexo-film-grain" />
    </div>
  );
}
