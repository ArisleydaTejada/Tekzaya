import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import { Link, type LinkProps } from "react-router-dom";

/**
 * Acción secundaria dentro de una tarjeta o pantalla ("Editar", "Ver todo", "Ver almacén"…):
 * botón tintado de la marca, para que no se lea como un enlace dentro del texto.
 * Las acciones principales siguen siendo el botón relleno de `accent`.
 */
const ACTION =
  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent-ink transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50";

export function ActionButton({ className = "", type = "button", ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={`${ACTION} ${className}`} {...rest} />;
}

/** La misma acción cuando lleva a otra pantalla. */
export function ActionLink({ className = "", ...rest }: LinkProps) {
  return <Link className={`${ACTION} ${className}`} {...rest} />;
}

/** La misma acción cuando salta a otra parte de la misma página (`href="#…"`). */
export function ActionAnchor({ className = "", ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a className={`${ACTION} ${className}`} {...rest} />;
}
