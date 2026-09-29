import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { XIcon } from "./icons";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export function Modal({ open, onClose, title, children, footer, wide }: ModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-label="Cerrar"
            onClick={onClose}
            className="absolute inset-0 bg-black/50"
          />
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`relative z-10 max-h-[85vh] w-full overflow-y-auto rounded-2xl border border-[var(--content-border)] bg-[var(--content-surface)] shadow-[var(--content-shadow)] ${
              wide ? "max-w-2xl" : "max-w-md"
            }`}
          >
            <div className="flex items-center justify-between border-b border-[var(--content-border)] px-5 py-4">
              <h2 className="font-display text-base font-semibold text-[var(--content-ink)]">{title}</h2>
              <button
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--content-ink-dim)] hover:bg-[var(--content-bg)]"
                aria-label="Cerrar"
              >
                <XIcon />
              </button>
            </div>
            <div className="px-5 py-4">{children}</div>
            {footer && <div className="flex items-center justify-end gap-2 border-t border-[var(--content-border)] px-5 py-3.5">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
