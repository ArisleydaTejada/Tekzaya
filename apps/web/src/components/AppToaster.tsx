import { Toaster } from "sonner";
import { useTheme } from "../theme/ThemeContext";

/**
 * Los avisos emergentes siguen el tema y usan las variables de la app, no los colores por defecto
 * de Sonner: así una confirmación se ve como parte de la interfaz y no como un añadido.
 */
export function AppToaster() {
  const { theme } = useTheme();

  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      closeButton
      toastOptions={{
        style: {
          background: "var(--content-surface)",
          color: "var(--content-ink)",
          border: "1px solid var(--content-border)",
          boxShadow: "var(--content-shadow)",
          fontFamily: "var(--font-body)",
        },
      }}
    />
  );
}
