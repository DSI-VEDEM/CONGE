import type { Config } from "tailwindcss";

const vdmGold = {
  50:  "#fff9ed",
  100: "#fff2d6",
  200: "#ffe2a3",
  300: "#ffd170",
  400: "#ffbe3e",
  500: "#f2a51f",
  600: "#d68715",
  700: "#a86710",
  800: "#74470b",
  900: "#3a2305",
};

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx,js,jsx}",
    "./components/**/*.{ts,tsx,js,jsx}",
    "./lib/**/*.{ts,tsx,js,jsx}",
    "./scripts/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        "vdm-gold": vdmGold,
      },
    },
  },
};

export default config;
