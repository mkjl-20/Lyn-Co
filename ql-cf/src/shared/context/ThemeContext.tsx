import { createContext, useContext, useState, type ReactNode } from "react";

export type AppTheme = "light" | "dark";

interface ThemeContextValue {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>("light");

  function setTheme(nextTheme: AppTheme) {
    setThemeState(nextTheme);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <div className="lynq-app" data-lynq-theme={theme}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useAppTheme must be used within ThemeProvider.");
  return context;
}
