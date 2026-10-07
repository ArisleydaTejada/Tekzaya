import iconColor from "../assets/logo/LogoIcon.png";
import lockupDark from "../assets/logo/LogoTekzayaTextDark.png";
import lockupWhite from "../assets/logo/LogoTekzayaTextWhite.png";
import { useTheme } from "../theme/ThemeContext";

/**
 * La marca, en sus dos piezas: el icono solo y el logotipo completo.
 *
 * El icono va siempre en color —sus dos moradas son las de la marca y se leen
 * igual sobre claro que sobre oscuro—, así que no tiene variante. El logotipo
 * sí: lleva "Tekzaya" escrito, y ese texto es negro o blanco según dónde se
 * pose. De elegir cuál se encarga este componente y no cada pantalla, porque
 * equivocarse deja el nombre invisible y nadie lo ve hasta que cambia de tema.
 *
 * `on` existe para los sitios cuyo fondo no depende del tema: la plancha del
 * login es oscura siempre y la placa del formulario, clara siempre. Ahí el tema
 * de la aplicación no sabe nada y decidir por él dejaría el nombre invisible en
 * uno de los dos.
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
