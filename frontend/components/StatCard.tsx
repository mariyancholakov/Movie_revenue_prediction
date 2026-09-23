import { CountUp } from './CountUp';

interface StatCardProps {
  label: string;
  value: string | number;
  /** primary emphasis (e.g. the predicted total) — larger, full ink */
  highlight?: boolean;
  /** negative reading ("in the red") — over budget / miss */
  accent?: boolean;
  /** optional numeric value + formatter to animate the figure totting up */
  countTo?: number;
  format?: (n: number) => string;
  /** one short line under the figure explaining it */
  note?: string;
}

export function StatCard({
  label,
  value,
  highlight = false,
  accent = false,
  countTo,
  format,
  note,
}: StatCardProps) {
  const color = accent ? 'text-red' : 'text-ink';
  const size = highlight
    ? 'text-[1.7rem] sm:text-[2.3rem]'
    : 'text-[1.25rem] sm:text-[1.6rem]';

  return (
    <div className="flex flex-col justify-between py-5 px-4 sm:px-6 min-h-[6.5rem]">
      <p className="font-mono text-[0.58rem] tracking-[0.16em] text-ink3 uppercase mb-3">
        {label}
      </p>
      <p
        className={`font-mono ${size} ${color} ${highlight ? 'font-bold' : 'font-normal'} leading-none tabular-nums`}
      >
        {countTo != null && format ? (
          <CountUp value={countTo} format={format} />
        ) : (
          value
        )}
      </p>
      {note && (
        <p className="font-sans text-[0.68rem] leading-snug text-ink3 mt-2 mb-0">{note}</p>
      )}
    </div>
  );
}
