import { initialsOf } from "@tekzaya/shared";

interface AvatarProps {
  name?: string;
  initials?: string;
  size?: "sm" | "md";
  available?: boolean;
  className?: string;
}

export function Avatar({ name, initials, size = "md", available, className = "" }: AvatarProps) {
  const label = initials ?? (name ? initialsOf(name) : "?");
  const dim = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs";
  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      <span
        className={`${dim} flex items-center justify-center rounded-full border border-[var(--content-border)] bg-steel/20 font-display font-semibold uppercase text-[var(--content-ink)]`}
        title={name}
      >
        {label}
      </span>
      {available !== undefined && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--content-bg)] ${
            available ? "bg-green" : "bg-[var(--content-ink-dim)]"
          }`}
          aria-hidden="true"
        />
      )}
    </span>
  );
}

/** Personas ya resueltas por el servidor: aquí no se busca a nadie por identificador. */
export function AvatarStack({
  users,
  max = 3,
}: {
  users: readonly { id: string; name: string }[];
  max?: number;
}) {
  if (users.length === 0) return null;
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  return (
    <span className="flex items-center">
      {shown.map((user, i) => (
        <span key={user.id} className={`relative ${i > 0 ? "-ml-1.5" : ""}`} style={{ zIndex: shown.length - i }}>
          <Avatar name={user.name} size="sm" className="ring-2 ring-[var(--content-bg)]" />
        </span>
      ))}
      {rest > 0 && (
        <span
          className="-ml-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--content-border)] bg-[var(--content-surface)] text-[10px] font-medium text-[var(--content-ink-dim)] ring-2 ring-[var(--content-bg)]"
          style={{ zIndex: 0 }}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}
