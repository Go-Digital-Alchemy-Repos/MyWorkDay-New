import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";
type AccentColor = "green" | "blue" | "indigo" | "teal" | "orange" | "slate";

const ACCENT_OPTIONS: AccentColor[] = ["green", "blue", "indigo", "teal", "orange", "slate"];

type ThemeProviderContextType = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  accent: AccentColor;
  setAccent: (accent: AccentColor) => void;
  accentOptions: AccentColor[];
};

const ThemeProviderContext = createContext<ThemeProviderContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("dasana-theme") as Theme;
      if (stored) return stored;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "light";
  });

  const [accent, setAccent] = useState<AccentColor>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("dasana-accent") as AccentColor;
      if (stored && ACCENT_OPTIONS.includes(stored)) return stored;
    }
    return "green";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    localStorage.setItem("dasana-theme", theme);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    ACCENT_OPTIONS.forEach((a) => root.classList.remove(`accent-${a}`));
    if (accent !== "green") {
      root.classList.add(`accent-${accent}`);
    }
    localStorage.setItem("dasana-accent", accent);
  }, [accent]);

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  return (
    <ThemeProviderContext.Provider value={{ theme, setTheme, toggleTheme, accent, setAccent, accentOptions: ACCENT_OPTIONS }}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeProviderContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
