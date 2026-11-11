import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitial(): Theme {
  try {
    const stored = window.localStorage.getItem("tekzaya-theme");

    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* private mode / blocked storage — fall through to default */
  }

  // Sin elección guardada, se sigue la preferencia del sistema.
  try {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
  } catch {
    /* sin matchMedia: claro */
  }

  return "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readInitial);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Solo se guarda lo que la persona eligió: si nunca tocó el interruptor, manda el sistema.
  function toggle() {
    setTheme((current) => {
      const next = current === "light" ? "dark" : "light";

      try {
        window.localStorage.setItem("tekzaya-theme", next);
      } catch {
        /* almacenamiento bloqueado: el cambio dura la sesión */
      }

      return next;
    });
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);

  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");

  return ctx;
}
