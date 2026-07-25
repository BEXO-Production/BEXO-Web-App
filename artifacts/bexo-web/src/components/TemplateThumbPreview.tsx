import React, { useState } from 'react';
import { getDemoPreviewUrl } from '../lib/templates';

type Props = {
  templateId: string;
  /** Rendered preview-area size in px (excludes the browser chrome strip). */
  width: number;
  height: number;
  /** Logical viewport width the portfolio is rendered at before scaling down. */
  logicalWidth?: number;
  /** Shown behind the iframe until it loads (prevents a blank flash). */
  fallback?: React.ReactNode;
};

/**
 * Live, scaled-down thumbnail of a real portfolio template.
 * Renders the actual demo render endpoint in a non-interactive iframe so
 * users can see what a layout looks like before opening the full preview.
 */
export function TemplateThumbPreview({
  templateId,
  width,
  height,
  logicalWidth = 1280,
  fallback,
}: Props) {
  const [loaded, setLoaded] = useState(false);
  const scale = width / logicalWidth;
  const logicalHeight = Math.round(height / scale);

  return (
    <div className="relative overflow-hidden bg-white" style={{ width, height }}>
      {fallback && (
        <div
          className={`absolute inset-0 transition-opacity duration-500 ${
            loaded ? 'opacity-0' : 'opacity-100'
          }`}
        >
          {fallback}
        </div>
      )}
      <iframe
        src={getDemoPreviewUrl(templateId)}
        title={`${templateId} preview`}
        loading="lazy"
        scrolling="no"
        aria-hidden="true"
        tabIndex={-1}
        onLoad={() => setLoaded(true)}
        className={`border-0 bg-white transition-opacity duration-500 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          width: logicalWidth,
          height: logicalHeight,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          pointerEvents: 'none',
        }}
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
