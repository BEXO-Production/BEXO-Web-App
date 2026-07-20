import React, { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";
import { getTemplatePreviewUrl, MARKETING_DEMO_HANDLE } from "@/lib/templates";

/** Demo portfolio used for marketing live previews — fictional persona only */
export const LANDING_DEMO_HANDLE = MARKETING_DEMO_HANDLE;

/** Desktop design width the templates are authored against */
const DESIGN_W = 1440;
const DESIGN_H = 1100;

type TemplatePreviewProps = {
  templateId: string;
  className?: string;
  title?: string;
  /** Skip intersection lazy-load (hero cards) */
  eager?: boolean;
  /**
   * Interactive iframe (preview modal). Default is pointer-events none + cover scale.
   */
  interactive?: boolean;
};

/**
 * Live template render via /api/render/:handle/:id.
 * Cover-scales a desktop viewport into the card so the preview fills the space
 * (object-fit: cover style) — avoids the inset/width conflict that left a tiny
 * top-left thumbnail with empty white space.
 */
export function TemplatePreview({
  templateId,
  className = "",
  title,
  eager = false,
  interactive = false,
}: TemplatePreviewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.12, margin: "180px 0px" });
  const shouldLoad = eager || inView || interactive;
  const src = getTemplatePreviewUrl(templateId, LANDING_DEMO_HANDLE);
  const [scale, setScale] = useState(0.35);

  useEffect(() => {
    if (interactive) return;
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width < 2 || height < 2) return;
      // Cover: fill both axes, crop overflow
      setScale(Math.max(width / DESIGN_W, height / DESIGN_H));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [interactive]);

  if (interactive) {
    return (
      <div ref={ref} className={`relative h-full w-full overflow-hidden bg-[#0d0d11] ${className}`}>
        <iframe
          key={src}
          src={src}
          title={title || `${templateId} preview`}
          className="absolute inset-0 h-full w-full border-0 bg-[#0d0d11]"
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="no-referrer"
          allow="clipboard-write"
        />
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={`landing-preview-frame ${className}`}
      style={{ backgroundColor: "#0f172a" }}
    >
      {!shouldLoad ? (
        <div
          className="absolute inset-0 animate-pulse"
          style={{
            background:
              "linear-gradient(135deg, #1e293b 0%, #334155 50%, #1e293b 100%)",
          }}
        />
      ) : (
        <iframe
          key={src}
          src={src}
          title={title || `${templateId} preview`}
          loading={eager ? "eager" : "lazy"}
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="no-referrer"
          className="landing-preview-iframe"
          style={{
            width: DESIGN_W,
            height: DESIGN_H,
            transform: `scale(${scale})`,
            WebkitTransform: `scale(${scale})`,
            transformOrigin: "top left",
            WebkitTransformOrigin: "top left",
          }}
        />
      )}
    </div>
  );
}
