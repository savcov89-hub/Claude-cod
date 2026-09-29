import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { SeriesPoint, Trend } from '../analytics';
import { fmtKg, trendLabel } from '../analytics';
import type { SetEntry } from '../types';

export const fmtDate = (v: string) =>
  new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(v));
export const fmtDateTime = (v: string) =>
  new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
    new Date(v),
  );
export const fmtSets = (sets: SetEntry[]) =>
  sets.length ? sets.map((s) => fmtKg(s.weight) + '×' + s.reps).join('  ') : '—';

/** Search key that forgives case, ё/е and doubled letters («пуловер» finds «Пулловер»). */
export const searchKey = (text: string) =>
  text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/(.)\1+/g, '$1');

export function ago(iso?: string | null) {
  if (!iso) return 'нет тренировок';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'вчера';
  return days + ' ' + plural(days, 'день', 'дня', 'дней') + ' назад';
}
export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
export const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return m >= 60 ? Math.floor(m / 60) + ' ч' : m + ':' + String(s % 60).padStart(2, '0');
};

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function Sheet({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className={'sheet' + (wide ? ' sheet-wide' : '')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export const Avatar = ({ name, live = false }: { name: string; live?: boolean }) => (
  <span className={'avatar' + (live ? ' live' : '')} aria-hidden="true">
    {name.slice(0, 1).toUpperCase()}
  </span>
);

const trendTone: Record<Trend, string> = {
  new: 'muted',
  pr: 'good',
  up: 'good',
  flat: 'muted',
  stall: 'warn',
  down: 'bad',
};
export const TrendChip = ({ trend, extra }: { trend: Trend; extra?: string }) => (
  <span className={'chip chip-' + trendTone[trend]}>
    {trend === 'pr' ? '★ ' : trend === 'up' ? '↑ ' : trend === 'down' ? '↓ ' : trend === 'stall' ? '■ ' : ''}
    {trendLabel[trend]}
    {extra ? ' · ' + extra : ''}
  </span>
);

/** e1RM line with an area fill and an emphasised last point. */
/** `fromZero` draws the scale from 0 (counts like steps), otherwise from the lowest point. */
export function Sparkline({
  points,
  width = 132,
  height = 40,
  fromZero = false,
}: {
  points: Array<Pick<SeriesPoint, 'date' | 'e1rm'>>;
  width?: number;
  height?: number;
  fromZero?: boolean;
}) {
  if (points.length < 2)
    return (
      <svg className="spark" width={width} height={height} aria-hidden="true">
        <line x1="0" x2={width} y1={height - 6} y2={height - 6} className="spark-grid" />
      </svg>
    );
  const pad = 4;
  const xs = points.map((p) => new Date(p.date).getTime());
  const ys = points.map((p) => p.e1rm);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const lo = fromZero ? 0 : Math.min(...ys);
  const hi = Math.max(...ys);
  const span = hi - lo || 1;
  const px = (x: number) => pad + ((x - x0) / (x1 - x0 || 1)) * (width - pad * 2);
  const py = (y: number) => height - pad - ((y - lo) / span) * (height - pad * 2);
  const line = points.map((p, i) => (i ? 'L' : 'M') + px(xs[i]).toFixed(1) + ' ' + py(p.e1rm).toFixed(1)).join(' ');
  const area = line + ` L${px(x1).toFixed(1)} ${height - pad} L${px(x0).toFixed(1)} ${height - pad} Z`;
  const last = points[points.length - 1];
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <line x1={pad} x2={width - pad} y1={py(lo)} y2={py(lo)} className="spark-grid" />
      <path d={area} className="spark-area" />
      <path d={line} className="spark-line" />
      <circle cx={px(x1)} cy={py(last.e1rm)} r="3.2" className="spark-dot" />
    </svg>
  );
}

/** Inline two-step confirmation (the viewer blocks window.confirm). */
export function Confirm({
  text,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
}: {
  text: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <div className="confirm" role="alertdialog">
      <p>{text}</p>
      <div className="row gap">
        <button className="btn" onClick={onCancel} disabled={busy}>
          Отмена
        </button>
        <button className="btn btn-primary" onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

/** Visits over the last `weeks` weeks as a Monday-first grid. */
export function VisitGrid({ visits, weeks = 8 }: { visits: string[]; weeks?: number }) {
  const set = new Set(visits);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) - (weeks - 1) * 7);
  const cells = [];
  for (let i = 0; i < weeks * 7; i += 1) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const future = d > today;
    cells.push(
      <i
        key={key}
        className={set.has(key) ? 'on' : future ? 'future' : ''}
        title={d.toLocaleDateString('ru-RU') + (set.has(key) ? ' — был' : '')}
      />,
    );
  }
  return (
    <div className="visit-grid-wrap">
      <div className="visit-days" aria-hidden="true">
        {['пн', '', 'ср', '', 'пт', '', 'вс'].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="visit-grid" style={{ gridTemplateColumns: `repeat(${weeks}, 1fr)` }}>
        {cells}
      </div>
    </div>
  );
}
