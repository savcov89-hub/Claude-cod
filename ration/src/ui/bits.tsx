import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function Chip({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button type="button" className="chip" data-on={on} onClick={onClick} title={title} aria-pressed={on}>
      {on && <Icon name="check" size={14} />}
      {children}
    </button>
  );
}

/** input=true — обёртка <label> для одиночного поля; иначе <div>, чтобы клик по подписи не нажимал первую кнопку группы. */
export function Field({ label, children, hint, input = false }: { label: string; children: ReactNode; hint?: string; input?: boolean }) {
  const Tag: "label" | "div" = input ? "label" : "div";
  return (
    <Tag className="block min-w-0">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </Tag>
  );
}

export function Segmented<T extends string>({ value, onChange, options, cols = 2 }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string; hint?: string }>; cols?: 2 | 3 }) {
  return (
    <div className={`grid gap-2 ${cols === 3 ? "grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`}>
      {options.map((o) => (
        <button key={o.value} type="button" className="option" onClick={() => onChange(o.value)} aria-pressed={value === o.value}>
          <span className="block text-sm font-semibold">{o.label}</span>
          {o.hint && <span className="mt-0.5 block text-xs text-muted">{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}

export function Bar({ pct, status }: { pct: number; status: "ok" | "low" | "high" | "na" }) {
  const color = status === "ok" ? "var(--good)" : status === "low" ? "var(--warn)" : status === "high" ? "var(--bad)" : "var(--ink-2)";
  const w = Math.max(2, Math.min(100, pct));
  return (
    <div className="bar" role="img" aria-label={`${Math.round(pct)} % от нормы`}>
      <i style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

export function Badge({ tone, children }: { tone: "ok" | "warn" | "danger" | "info" | "muted"; children: ReactNode }) {
  const map = { ok: "bg-ok-soft text-ok", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger", info: "bg-info-soft text-info", muted: "bg-surface-2 text-muted" } as const;
  return <span className={`pill ${map[tone]}`}>{children}</span>;
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card !p-3 sm:!p-4">
      <div className="label !mb-1">{label}</div>
      <div className="num text-xl font-bold leading-tight sm:text-2xl">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

const PATHS: Record<string, string> = {
  check: "M5 13l4 4L19 7",
  form: "M8 2h8v4H8zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M12 11h4M12 16h4M8 11h.01M8 16h.01",
  menu: "M3 2v7a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6a2 2 0 0 0 2 2h3zM21 15v7",
  pot: "M4 10h16v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM2 10h20M8 6c0-1 1-1 1-2M12 6c0-1 1-1 1-2M16 6c0-1 1-1 1-2",
  cart: "M8 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM2 2h2l2.7 12.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 1.9-1.6L22 7H5.1",
  pulse: "M22 12h-4l-3 9L9 3l-3 9H2",
  book: "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z",
  sun: "M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  print: "M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z",
  back: "M15 18l-6-6 6-6",
};
export function Icon({ name, size = 19 }: { name: keyof typeof PATHS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}
