/** Colors mirrored from the BEXO design canvas (`BEXO Mobile App(1)/BEXO Mobile v2.dc.html`)
 * so mobile stays visually consistent with the brand established there and on web. */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        ink: "#16171B",
        paper: "#F3F1EC",
        panel: "#FFFFFF",
        panelStrong: "#FBFAF7",
        deep: "#E9E6DF",
        desk: "#DCD8CF",
        bezel: "#F7F5F1",
        chrome: "#101014",
        accent: "#2F6BFF",
        accentSoft: "#2554D6",
        accentWash: "#EBF1FF",
        cta: "#16171B",
        success: "#0E9F5D",
        warn: "#B3730A",
        danger: "#D93843",
        border: "rgba(22,23,27,0.10)",
        borderStrong: "rgba(22,23,27,0.20)",
        muted: "rgba(22,23,27,0.60)",
        faint: "rgba(22,23,27,0.38)",
      },
      borderRadius: {
        card: "20px",
        pill: "999px",
      },
    },
  },
  plugins: [],
};
