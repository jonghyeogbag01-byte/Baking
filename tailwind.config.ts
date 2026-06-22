import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        parchment: "#F7F3ED",
        cream: "#EFE8DC",
        espresso: "#2B1D0E",
        mocha: "#5C3D1E",
        gold: "#C8821A",
        "gold-light": "#F0C97A",
      },
      fontFamily: {
        sans: ["Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
