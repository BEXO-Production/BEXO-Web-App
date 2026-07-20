import { useEffect } from "react";
import { applyPageSeo, type PageSeoConfig } from "@/lib/seo";

export function usePageSeo(config: PageSeoConfig) {
  useEffect(() => {
    applyPageSeo(config);
  }, [
    config.title,
    config.description,
    config.canonical,
    config.ogImage,
    config.ogType,
    config.noindex,
    JSON.stringify(config.jsonLd),
  ]);
}
