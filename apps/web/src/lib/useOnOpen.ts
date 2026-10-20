import { useState } from "react";

/**
 * Corre `reset` en el render en que un diálogo pasa de cerrado a abierto, para
 * que cada apertura parta de cero. Es el patrón de "estado previo" de React en
 * vez de un efecto: un efecto pintaría primero el diálogo con lo de la vez
 * anterior y lo limpiaría en un segundo render.
 */
export function useOnOpen(open: boolean, reset: () => void): void {
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) reset();
  }
}
