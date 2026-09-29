import { motion } from "motion/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ConflictingHandlers =
  | "onDrag"
  | "onDragStart"
  | "onDragEnd"
  | "onAnimationStart"
  | "onAnimationEnd";

interface LeverButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, ConflictingHandlers> {
  icon?: ReactNode;
  busy?: boolean;
  children: ReactNode;
}

export function LeverButton({ icon, busy = false, children, disabled, className = "", ...rest }: LeverButtonProps) {
  return (
    <motion.button
      type="button"
      disabled={disabled || busy}
      className={`group flex w-full items-center justify-center gap-2.5 rounded-xl border border-placard-border bg-placard-surface px-4 py-3 text-sm font-semibold text-placard-ink shadow-[0_1px_2px_rgba(18,20,26,0.04)] transition-colors hover:bg-placard/60 disabled:cursor-not-allowed disabled:opacity-70 ${className}`}
      whileTap={disabled || busy ? undefined : { y: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      {...rest}
    >
      {busy ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-placard-border border-t-accent"
          aria-hidden="true"
        />
      ) : (
        icon
      )}
      <span>{children}</span>
    </motion.button>
  );
}
