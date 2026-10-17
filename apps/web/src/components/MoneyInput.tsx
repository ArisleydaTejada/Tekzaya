import { formatAmountInput } from "@tekzaya/shared";
import { useLayoutEffect, useRef } from "react";

/** Cuántas cifras o puntos hay antes de `position`: lo que no cambia al reagrupar las comas. */
function significantBefore(text: string, position: number): number {
  return text.slice(0, position).replace(/[^\d.]/g, "").length;
}

/** La posición en `text` justo después de la `count`-ésima cifra o punto. */
function positionAfter(text: string, count: number): number {
  if (count === 0) return 0;
  let seen = 0;
  for (let index = 0; index < text.length; index++) {
    if (/[\d.]/.test(text[index]!)) seen++;
    if (seen === count) return index + 1;
  }
  return text.length;
}

/**
 * Campo de monto con la moneda delante. Solo admite cifras y un punto decimal, y
 * agrupa los miles con comas mientras se escribe. Al reagrupar, el cursor se
 * queda detrás de la misma cifra: sin eso, escribir en medio de "1,129" lo
 * mandaría al final en cada tecla.
 */
export function MoneyInput({
  id,
  value,
  onChange,
  currency,
  placeholder = "0.00",
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Código ISO de la moneda configurada: "USD", "DOP"… */
  currency: string;
  placeholder?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (caret.current === null || !input.current) return;
    input.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [value]);

  return (
    <div className="flex items-stretch overflow-hidden rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] focus-within:border-accent">
      <span
        className="flex items-center border-r border-[var(--content-border)] bg-[var(--content-surface)] px-2.5 font-display text-xs font-semibold tracking-wide text-[var(--content-ink-dim)]"
        title={`Los montos se guardan en ${currency}`}
      >
        {currency}
      </span>
      <input
        ref={input}
        id={id}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        aria-describedby={`${id}-currency`}
        onChange={(event) => {
          const raw = event.target.value;
          const next = formatAmountInput(raw);
          caret.current = positionAfter(next, significantBefore(raw, event.target.selectionStart ?? raw.length));
          onChange(next);
        }}
        onBlur={() => {
          // "1,129.5" se lee mejor como "1,129.50"; un entero se deja como está.
          if (/\.\d$/.test(value)) onChange(`${value}0`);
          else if (value.endsWith(".")) onChange(value.slice(0, -1));
        }}
        className="w-full min-w-0 bg-transparent px-3 py-2 text-right text-sm tabular text-[var(--content-ink)] outline-none placeholder:text-[var(--content-ink-dim)]"
      />
      <span id={`${id}-currency`} className="sr-only">
        en {currency}
      </span>
    </div>
  );
}
