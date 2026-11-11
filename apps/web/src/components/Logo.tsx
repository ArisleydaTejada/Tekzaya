import iconColor from "../assets/logo/LogoIcon.png";
import lockupDark from "../assets/logo/LogoTekzayaTextDark.png";
import lockupWhite from "../assets/logo/LogoTekzayaTextWhite.png";
import { useTheme } from "../theme/ThemeContext";

/**
 * El logotipo elige aquí su texto negro o blanco: equivocarse deja el nombre invisible en un tema.
 * `on` fija el fondo donde no depende del tema (la plancha del login, la placa del formulario).
 */

export function LogoMark({ className = "" }: { className?: string }) {
  return <img src={iconColor} alt="" aria-hidden="true" className={className} />;
}

export function LogoLockup({
  className = "",
  on,
}: {
  className?: string;
  /** Fondo fijo, al margen del tema. Sin esto manda el tema. */
  on?: "dark" | "light";
}) {
  const { theme } = useTheme();
  const background = on ?? theme;

  return (
    <img
      src={background === "dark" ? lockupWhite : lockupDark}
      alt="Tekzaya"
      className={className}
    />
  );
}
