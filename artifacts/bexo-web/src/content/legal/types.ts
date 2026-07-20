export type LegalBlock =
  | { type: "p"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "note"; text: string };

export type LegalSection = {
  title: string;
  blocks: LegalBlock[];
};

export type LegalDoc = {
  title: string;
  lead: string;
  sections: LegalSection[];
};
