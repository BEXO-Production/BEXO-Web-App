/**
 * Local demo profile — used only when the gateway has not injected
 * window.__BEXO_PROFILE__. Production handle renders never hit this.
 */
(function () {
  if (typeof window === "undefined") return;
  if (window.__BEXO_PROFILE__) return;

  const depth = location.pathname.includes("/projects/") || location.pathname.includes("/blogs/")
    ? "../../"
    : location.pathname.includes("/pages/")
      ? "../"
      : "./";

  window.__BEXO_LOCAL_DEMO__ = {
    user: {
      name: "Sierra Montana",
      email: "hello@sierramontana.com",
      photoUrl: `${depth}assets/portraits/img-1.png`,
      resumeUrl: "",
      openToHire: true,
      templateId: "sierra-montana",
      themeColor: "gold",
      themeBg: "grid",
    },
    profile: {
      handle: "sierramontana",
      headline: "Rhythm Designer & Composer",
      careerGoal: "Building immersive audio experiences through editorial design.",
      bio: "Sierra Montana is a rhythm designer recognized for audio installations and brand sound systems.",
    },
    aboutEntries: [
      {
        id: "1",
        title: "Rhythm Designer",
        description:
          "Designing immersive audio environments and brand sound systems for cultural spaces.",
        currentStatus: "Independent practice, Boston",
      },
    ],
    educationEntries: [
      {
        degree: "Bachelor of Music in Music Synthesis",
        institution: "Berklee College of Music",
        startYear: "2014",
        endYear: "2018",
        grade: "3.9 GPA",
      },
    ],
    experienceEntries: [
      {
        role: "Lead Sound Designer",
        company: "Vitaluxe Studios",
        startDate: "2019",
        endDate: "Present",
        responsibilities: ["Directed multi-room audio installations for touring exhibitions."],
      },
    ],
    projectEntries: [
      {
        id: "solara",
        title: "Solara",
        category: "Installation",
        description: "A multi-room audio installation exploring temperature and rhythm.",
        techStack: "Max/MSP · Ableton · Custom sensors",
        role: "Creative Direction",
        year: "2024",
        link: "https://example.com",
        images: [
          `${depth}assets/portraits/img-2.png`,
          `${depth}assets/portraits/img-3.png`,
          `${depth}assets/portraits/img-4.png`,
        ],
        pdfs: [],
      },
      {
        id: "alura",
        title: "Alura",
        category: "Brand Sound",
        description: "Sonic identity system for a contemporary cruise experience.",
        techStack: "Logic Pro · Field Recording",
        role: "Composer",
        year: "2023",
        images: [`${depth}assets/portraits/img-5.png`],
        pdfs: [],
      },
    ],
    certificateEntries: [],
    achievementEntries: [
      {
        title: "Best Sound Installation",
        awarder: "Boston Design Week",
        year: "2024",
        project: "Solara",
      },
    ],
    researchEntries: [],
    skillEntries: [
      { name: "Sound Design" },
      { name: "Composition" },
      { name: "Max/MSP" },
      { name: "Installation" },
    ],
    contactData: {
      email: "hello@sierramontana.com",
      linkedin: "https://linkedin.com",
      socials: [{ label: "Instagram", url: "https://instagram.com" }],
    },
  };

  // Mirror into __BEXO_PROFILE__ for local static preview only
  window.__BEXO_PROFILE__ = window.__BEXO_LOCAL_DEMO__;
})();
