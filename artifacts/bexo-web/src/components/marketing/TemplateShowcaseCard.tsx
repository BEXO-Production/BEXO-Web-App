import React, { useCallback, useRef, useState } from "react";
import { Eye } from "lucide-react";
import { TemplatePreview } from "@/components/marketing/TemplatePreview";
import type { PortfolioTemplate } from "@/lib/templates";

type TemplateShowcaseCardProps = {
  template: PortfolioTemplate;
  label?: string;
  /** Extra classes on the outer card shell */
  className?: string;
  /** Fixed preview height / fill mode */
  previewClassName?: string;
  eager?: boolean;
  /** Hero stagger margin classes */
  lift?: string;
  onPreview: (template: PortfolioTemplate) => void;
  /** Compact hero card (label overlay only) */
  variant?: "hero" | "grid";
};

/**
 * Template card with cover-scaled live preview, magnetic cursor ring,
 * and an explicit Preview button / click-to-open.
 */
export function TemplateShowcaseCard({
  template,
  label,
  className = "",
  previewClassName = "h-52 sm:h-56",
  eager = false,
  lift = "",
  onPreview,
  variant = "grid",
}: TemplateShowcaseCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0, visible: false });
  const [hovered, setHovered] = useState(false);

  const onMove = useCallback((e: React.MouseEvent) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCursor({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      visible: true,
    });
  }, []);

  const open = () => onPreview(template);

  if (variant === "hero") {
    return (
      <article
        ref={cardRef}
        className={`group relative h-[88%] cursor-none overflow-hidden rounded-2xl border border-white/15 bg-[#0d0d11] shadow-2xl shadow-black/50 ${lift} ${className}`}
        onMouseMove={onMove}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          setHovered(false);
          setCursor((c) => ({ ...c, visible: false }));
        }}
        onClick={open}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open();
          }
        }}
        aria-label={`Preview ${template.name}`}
      >
        <TemplatePreview
          templateId={template.id}
          title={template.name}
          eager={eager}
          className="absolute inset-0 h-full w-full"
        />

        {/* Magnetic cursor */}
        <div
          className="pointer-events-none absolute z-20 hidden sm:block"
          style={{
            left: cursor.x,
            top: cursor.y,
            opacity: cursor.visible ? 1 : 0,
            transform: "translate(-50%, -50%)",
            transition: "opacity 0.15s ease",
          }}
        >
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-full border border-white/40 bg-[#2F6BFF]/90 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg shadow-blue-500/40 backdrop-blur-sm transition-transform duration-200 ${
              hovered ? "scale-100" : "scale-75"
            }`}
          >
            Preview
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pb-3 pt-14">
          {label && (
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">{label}</p>
          )}
          <p className="font-serif text-base font-bold text-white sm:text-lg">{template.name}</p>
        </div>

        {/* Always-visible Preview control (cursor ring is desktop enhancement) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            open();
          }}
          className="absolute right-3 top-3 z-30 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black/55 px-3 py-1.5 text-[11px] font-bold text-white shadow-lg backdrop-blur-md transition hover:bg-[#2F6BFF]"
        >
          <Eye className="h-3.5 w-3.5" />
          Preview
        </button>
      </article>
    );
  }

  return (
    <article
      ref={cardRef}
      className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition hover:border-[#2F6BFF]/45 ${className}`}
      onMouseMove={onMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setCursor((c) => ({ ...c, visible: false }));
      }}
    >
      <div
        className="relative cursor-none"
        onClick={open}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open();
          }
        }}
        aria-label={`Preview ${template.name}`}
      >
        <TemplatePreview
          templateId={template.id}
          title={template.name}
          eager={eager}
          className={`w-full ${previewClassName}`}
        />

        {/* Magnetic cursor — coords relative to card; clip to preview via overflow */}
        <div
          className="pointer-events-none absolute inset-0 z-20 hidden overflow-hidden sm:block"
          aria-hidden
        >
          <div
            style={{
              position: "absolute",
              left: cursor.x,
              top: cursor.y,
              opacity: cursor.visible ? 1 : 0,
              transform: "translate(-50%, -50%)",
              transition: "opacity 0.15s ease",
            }}
          >
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-full border border-white/35 bg-[#2F6BFF]/90 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg shadow-blue-500/35 backdrop-blur-sm transition-transform duration-200 ${
                hovered ? "scale-100" : "scale-75"
              }`}
            >
              Open
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
      </div>

      <div className="p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-serif text-lg font-bold text-white">{template.name}</h3>
          {template.isPro ? (
            <span className="rounded-full bg-[#2F6BFF]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#9BB6FF]">
              Pro
            </span>
          ) : (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
              Free
            </span>
          )}
        </div>
        <p className="landing-muted mt-2 text-xs leading-relaxed">{template.description}</p>
        <button
          type="button"
          onClick={open}
          className="mt-4 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-bold text-white transition hover:border-[#2F6BFF]/50 hover:bg-[#2F6BFF]"
        >
          <Eye className="h-4 w-4" />
          Preview template
        </button>
      </div>
    </article>
  );
}
