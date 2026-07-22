import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { FileAsset, LinkAsset } from '../context/OnboardingContext';
import { ExternalLink, Copy, Check, ChevronLeft, ChevronRight, FileText, Image as ImageIcon, Link as LinkIcon, Download } from 'lucide-react';
import { cn } from '../design-system/primitives';

export type PreviewTarget = 
  | { type: 'images'; index: number; items: FileAsset[] }
  | { type: 'pdfs'; index: number; items: FileAsset[] }
  | { type: 'links'; index: number; items: LinkAsset[] }
  | null;

interface AssetPreviewModalProps {
  target: PreviewTarget;
  onClose: () => void;
}

export function AssetPreviewModal({ target, onClose }: AssetPreviewModalProps) {
  const [copied, setCopied] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(target ? target.index : 0);

  // Sync index when target changes
  React.useEffect(() => {
    if (target) {
      setCurrentIndex(target.index);
    }
  }, [target]);

  if (!target || !target.items || target.items.length === 0) return null;

  const currentItem = target.items[currentIndex] || target.items[0];

  const handleCopyLink = (url: string) => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : target.items.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < target.items.length - 1 ? prev + 1 : 0));
  };

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] p-4 sm:p-6 overflow-y-auto bg-slate-900 text-white border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl z-50">
        <DialogHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-800 pr-8">
          <div className="flex items-center gap-2.5 min-w-0">
            {target.type === 'images' && <ImageIcon className="w-5 h-5 text-indigo-400 shrink-0" />}
            {target.type === 'pdfs' && <FileText className="w-5 h-5 text-red-400 shrink-0" />}
            {target.type === 'links' && <LinkIcon className="w-5 h-5 text-emerald-400 shrink-0" />}
            
            <DialogTitle className="text-base sm:text-lg font-semibold text-white truncate">
              {target.type === 'images' && `Image Preview (${currentIndex + 1}/${target.items.length})`}
              {target.type === 'pdfs' && ((currentItem as FileAsset).name || `PDF Document (${currentIndex + 1}/${target.items.length})`)}
              {target.type === 'links' && ((currentItem as LinkAsset).name || 'External Link Preview')}
            </DialogTitle>
          </div>
        </DialogHeader>

        {/* Content Body */}
        <div className="py-3 flex flex-col items-center justify-center min-h-[240px] max-h-[70vh]">
          {/* IMAGE PREVIEW */}
          {target.type === 'images' && (
            <div className="relative w-full flex flex-col items-center justify-center">
              <div className="relative max-h-[58vh] w-full flex items-center justify-center overflow-hidden rounded-xl bg-slate-950 border border-slate-800/80 p-2">
                <img
                  src={(currentItem as FileAsset).url}
                  alt={(currentItem as FileAsset).name || 'Uploaded image'}
                  className="max-h-[55vh] max-w-full object-contain rounded-lg shadow-lg"
                />
              </div>

              {/* Navigation Arrows for Images */}
              {target.items.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-slate-900/90 hover:bg-indigo-600 text-white border border-slate-700 flex items-center justify-center shadow-lg backdrop-blur-sm transition-all duration-200 cursor-pointer z-10"
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-slate-900/90 hover:bg-indigo-600 text-white border border-slate-700 flex items-center justify-center shadow-lg backdrop-blur-sm transition-all duration-200 cursor-pointer z-10"
                    aria-label="Next image"
                  >
                    <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
                  </button>
                </>
              )}
            </div>
          )}

          {/* PDF PREVIEW */}
          {target.type === 'pdfs' && (
            <div className="w-full flex flex-col items-center gap-4">
              <div className="w-full h-[52vh] rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center relative">
                <iframe
                  src={`${(currentItem as FileAsset).url}#toolbar=0`}
                  title={(currentItem as FileAsset).name || 'PDF Preview'}
                  className="w-full h-full border-0 rounded-xl"
                />
              </div>

              {/* PDF Info & Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 w-full px-1">
                <span className="text-xs text-slate-400 truncate">
                  Size: {(((currentItem as FileAsset).sizeBytes || 0) / 1024 / 1024).toFixed(1)}MB
                </span>
                
                <div className="flex items-center gap-2">
                  <a
                    href={(currentItem as FileAsset).url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Open PDF
                  </a>
                  <a
                    href={(currentItem as FileAsset).url}
                    download={(currentItem as FileAsset).name || 'document.pdf'}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* LINK PREVIEW */}
          {target.type === 'links' && (
            <div className="w-full max-w-lg p-6 bg-slate-950 border border-slate-800 rounded-2xl flex flex-col items-center text-center space-y-4 my-auto">
              <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <LinkIcon className="w-7 h-7" />
              </div>
              
              <div className="w-full">
                <h3 className="text-lg font-bold text-white mb-1 truncate">
                  {(currentItem as LinkAsset).name || 'External Link'}
                </h3>
                <p className="text-xs text-slate-300 break-all font-mono bg-slate-900/90 px-3 py-2 rounded-lg border border-slate-800 max-w-full">
                  {(currentItem as LinkAsset).url || 'No URL specified'}
                </p>
              </div>

              <div className="flex items-center justify-center gap-3 pt-2 w-full">
                <button
                  type="button"
                  onClick={() => handleCopyLink((currentItem as LinkAsset).url)}
                  className="flex-1 inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-200 transition-colors"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
                <a
                  href={(currentItem as LinkAsset).url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "flex-1 inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors shadow-lg shadow-indigo-600/30",
                    !(currentItem as LinkAsset).url ? "pointer-events-none opacity-50" : ""
                  )}
                >
                  <ExternalLink className="w-4 h-4" /> Open Link
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer info for Images */}
        {target.type === 'images' && (
          <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs text-slate-400">
            <span className="truncate max-w-[60%] font-medium text-slate-300">
              {(currentItem as FileAsset).name || `Image #${currentIndex + 1}`}
            </span>
            <a
              href={(currentItem as FileAsset).url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-indigo-400 hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Open original
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
