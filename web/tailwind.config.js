/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: {
          DEFAULT: "#FBF6EE",
          50: "#FDFAF4",
          100: "#FBF6EE",
          200: "#F5EFE3",
          300: "#EDE4D2",
        },
        blue: {
          soft: "#BFD9FF",
          primary: "#5B8FF9",
          deep: "#2563EB",
          darker: "#1E40AF",
        },
        orange: {
          soft: "#FFD0B0",
          accent: "#FF8A4C",
          deep: "#E5703A",
        },
        ink: {
          DEFAULT: "#1A1F2E",
          primary: "#1A1F2E",
          secondary: "#5C667A",
          muted: "#8A93A8",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "Manrope",
          "Onest",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "sans-serif",
        ],
        marker: [
          '"Snugle"',
          '"Caveat Brush"',
          '"Caveat"',
          '"Patrick Hand"',
          '"Comic Sans MS"',
          "cursive",
        ],
      },
      borderRadius: {
        // 3-tier concentric system: outer cards = lg (24), nested fields = md
        // (16), inner chips/inputs inside fields = sm (12). Picking radii in
        // the same scale family means stacked surfaces feel like one design,
        // not three different ones.
        glass: "24px",
        "glass-md": "16px",
        "glass-sm": "12px",
        pill: "999px",
      },
      boxShadow: {
        glass:
          "0 1px 0 rgba(255,255,255,0.6) inset, 0 8px 24px rgba(30,60,120,0.08), 0 1px 2px rgba(30,60,120,0.04)",
        "glass-lg":
          "0 1px 0 rgba(255,255,255,0.7) inset, 0 16px 48px rgba(30,60,120,0.12), 0 2px 4px rgba(30,60,120,0.06)",
        // Floating modals — third elevation layer above glass-strong. More
        // pronounced drop + extra depth so they read as a separate plane
        // sitting above the page surface.
        "glass-floating":
          "0 1px 0 rgba(255,255,255,0.85) inset, 0 32px 72px rgba(30,60,120,0.22), 0 8px 24px rgba(30,60,120,0.12), 0 2px 6px rgba(30,60,120,0.08)",
        soft: "0 2px 8px rgba(30,60,120,0.06)",
      },
      backdropBlur: {
        glass: "24px",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translate(0, 0)" },
          "50%": { transform: "translate(20px, -16px)" },
        },
        floatSlow: {
          "0%, 100%": { transform: "translate(0, 0)" },
          "50%": { transform: "translate(-30px, 20px)" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        float: "float 14s ease-in-out infinite",
        "float-slow": "floatSlow 18s ease-in-out infinite",
        "fade-up": "fadeUp 0.6s ease-out both",
      },
    },
  },
  plugins: [],
};
