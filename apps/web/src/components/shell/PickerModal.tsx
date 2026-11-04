import { useEffect, useRef, useState, type ReactNode } from "react";
import { SearchIcon } from "../icons";
import { Modal } from "../Modal";
import type { PickerSlotProps } from "./RecordTabs";

export interface PickerSection<T> {
  title: string;
  items: T[];
}

export interface PickerResult<T> {
  sections: PickerSection<T>[];
  isLoading: boolean;
  isError: boolean;
}

interface PickerModalProps<T> extends PickerSlotProps {
  title: string;
  placeholder: string;
  searchLabel: string;
  /** Hook: los grupos a mostrar para lo buscado, ya en su orden. */
  useSections: (search: string, open: boolean) => PickerResult<T>;
  keyOf: (item: T) => string;
  numberOf: (item: T) => string;
  /** Lo que va tras el número: título, detalle y etiquetas. */
  renderRow: (item: T) => ReactNode;
}

/**
 * Buscador para sumar una pestaña: un campo arriba y los registros abajo, por
 * grupos. Se maneja también con teclado: ↑ ↓ para moverse, Enter para abrir.
 */
export function PickerModal<T>({
  open,
  onClose,
  openTabs,
  onPick,
  title,
  placeholder,
  searchLabel,
  useSections,
  keyOf,
  numberOf,
  renderRow,
}: PickerModalProps<T>) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setDebounced("");
    setHighlight(0);
    // Espera a que el modal monte el campo antes de enfocarlo.
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => setHighlight(0), [debounced]);

  const { sections, isLoading, isError } = useSections(debounced, open);
  const items = sections.flatMap((section) => section.items);

  function pick(index: number) {
    const item = items[index];
    if (item !== undefined) onPick(numberOf(item));
  }

  return (
    <Modal open={open} onClose={onClose} title={title} wide>
      <label className="flex items-center gap-2 rounded-xl border border-[var(--content-border)] bg-[var(--content-bg)] px-3 focus-within:border-accent">
        <SearchIcon className="h-4 w-4 shrink-0 text-[var(--content-ink-dim)]" />
        <input
          ref={inputRef}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setHighlight((h) => Math.min(h + 1, items.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              pick(highlight);
            } else if (event.key === "Escape") {
              onClose();
            }
          }}
          placeholder={placeholder}
          aria-label={searchLabel}
          className="h-10 w-full bg-transparent text-sm text-[var(--content-ink)] outline-none placeholder:text-[var(--content-ink-dim)]"
        />
      </label>

      <div className="-mx-2 mt-3 max-h-[55vh] overflow-y-auto">
        {isLoading ? (
          <p className="px-2 py-6 text-center text-sm text-[var(--content-ink-dim)]">Cargando…</p>
        ) : isError ? (
          <p className="px-2 py-6 text-center text-sm text-red">No se pudo cargar la lista.</p>
        ) : items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-[var(--content-ink-dim)]">
            {debounced ? `Nada coincide con «${debounced}».` : "No hay nada para mostrar."}
          </p>
        ) : (
          <div role="listbox" aria-label={title}>
            {sections.map((section) => (
              <div key={section.title} role="group" aria-label={section.title} className="mb-2">
                <p className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-[var(--content-ink-dim)]">
                  {section.title}
                </p>
                {section.items.map((item) => {
                  const index = items.indexOf(item);
                  const number = numberOf(item);
                  return (
                    <button
                      key={keyOf(item)}
                      type="button"
                      role="option"
                      aria-selected={index === highlight}
                      onClick={() => pick(index)}
                      onMouseEnter={() => setHighlight(index)}
                      className={`flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm ${
                        index === highlight ? "bg-[var(--content-bg)]" : ""
                      }`}
                    >
                      <span className="w-[86px] shrink-0 font-display font-semibold tabular text-accent-ink">{number}</span>
                      {renderRow(item)}
                      {openTabs.includes(number) && (
                        <span className="hidden shrink-0 text-xs text-[var(--content-ink-dim)] sm:inline">Ya abierta</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Junta varias listas en grupos, sin repetir: cada registro sale en el primero que lo trae. */
export function dedupeSections<T>(keyOf: (item: T) => string, sections: PickerSection<T>[]): PickerSection<T>[] {
  const seen = new Set<string>();
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const key = keyOf(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    }))
    .filter((section) => section.items.length > 0);
}
