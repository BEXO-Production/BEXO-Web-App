import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { Link } from "wouter";
import { ArrowRight, X } from "lucide-react";
import { TemplatePreview, LANDING_DEMO_HANDLE } from "@/components/marketing/TemplatePreview";
import { getTemplatePreviewUrl, type PortfolioTemplate } from "@/lib/templates";

type TemplatePreviewModalProps = {
  template: PortfolioTemplate;
  onClose: () => void;
};

export function TemplatePreviewModal({ template, onClose }: TemplatePreviewModalProps) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const url = getTemplatePreviewUrl(template.id, LANDING_DEMO_HANDLE);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-0 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={`${template.name} preview`}
    >
      <button
        type="button"
        className="absolute inset-0 bg-[#05080f]/75 backdrop-blur-md"
        aria-label="Close preview"
        onClick={onClose}
      />

      <div className="relative flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden bg-[#0d0d11] shadow-2xl sm:h-[90vh] sm:rounded-2xl sm:border sm:border-white/10">
        {/* Chrome */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#111827] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="hidden items-center gap-1.5 sm:flex">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </div>
            <p className="truncate font-serif text-sm font-bold text-white sm:ml-2">{template.name}</p>
            {template.isPro ? (
              <span className="shrink-0 rounded-full bg-[#2F6BFF]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#9BB6FF]">
                Pro
              </span>
            ) : (
              <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                Free
              </span>
            )}
            <span className="hidden truncate rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-white/45 sm:inline">
              {url.replace(/^\//, "")}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Live interactive preview */}
        <div className="relative min-h-0 flex-1 bg-white">
          <TemplatePreview
            templateId={template.id}
            title={template.name}
            interactive
            eager
            className="h-full w-full"
          />
        </div>

        {/* Actions */}
        <div className="flex shrink-0 flex-col gap-3 border-t border-white/10 bg-[#111827] px-4 py-3 sm:flex-row sm:items-center sm:justify-between pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <p className="text-xs leading-snug text-white/50">{template.description}</p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center justify-center rounded-full border border-white/15 px-4 text-sm font-semibold text-white/80 transition hover:bg-white/5"
            >
              Close
            </button>
            <Link
              href="/login"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#2F6BFF] px-5 text-sm font-bold text-white transition hover:bg-[#2558e0]"
            >
              Use this template <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
