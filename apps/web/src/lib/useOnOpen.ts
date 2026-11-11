import { useState } from "react";

/**
 * Corre `reset` en el render en que el diálogo se abre (patrón de estado previo de React).
 * Un efecto pintaría primero lo de la vez anterior y lo limpiaría en un segundo render.
 */
export function useOnOpen(open: boolean, reset: () => void): void {
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);

    if (open) reset();
  }
}
