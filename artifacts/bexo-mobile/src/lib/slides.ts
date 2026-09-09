/** The four onboarding slides, copied verbatim from SLIDES in the design canvas. */
export interface Slide {
  eyebrow: string;
  title: string;
  highlight: string;
  body: string;
  chips: string[];
}

export const SLIDES: Slide[] = [
  {
    eyebrow: "Your work, shown properly",
    title: "A portfolio that",
    highlight: "feels like you",
    body: "Your projects, certificates and awards — live at your own address, not buried in a PDF.",
    chips: ["yourname.atbexo.com", "Premium templates", "Live in minutes"],
  },
  {
    eyebrow: "Made to be found",
    title: "Recruiters find you,",
    highlight: "not a file",
    body: "Search-ready pages, visitor analytics, and every enquiry in one calm inbox.",
    chips: ["SEO-ready", "Who visited", "Enquiries inbox"],
  },
  {
    eyebrow: "Ten minutes, start to live",
    title: "Upload once.",
    highlight: "We fill the rest",
    body: "AI reads your resume, you review, snap certificates, pick a look — publish.",
    chips: ["AI parsing", "Camera scan", "Edit anytime"],
  },
  {
    eyebrow: "This is the part people don't expect",
    title: "Every card you meet",
    highlight: "becomes a map",
    body: "BEXO quietly traces how your connections link to each other — so you always know who can introduce you to who.",
    chips: ["Live connection mesh", "Who knows who", "Tap anyone to open their site"],
  },
];
