import { CountUp } from './CountUp';

interface StatCardProps {
  label: string;
  value: string | number;
  /** negative reading ("in the red") — over budget / miss */
  accent?: boolean;
  /** optional numeric value + formatter to animate the figure totting up */
  countTo?: number;
  format?: (n: number) => string;
}

// Every figure in the prediction ledger is set the same way (one face, one
// size, one weight) with its label above, so a row of them reads as a row.
export function StatCard({ label, value, accent = false, countTo, format }: StatCardProps) {
  return (
    <div className="flex flex-col justify-between gap-3 py-5 px-4 sm:px-6 h-full">
      <p className="font-mono text-[0.58rem] tracking-[0.16em] text-ink3 uppercase m-0">
        {label}
      </p>
      <p className={`font-mono text-[1.25rem] sm:text-[1.6rem] font-normal leading-none tabular-nums m-0 ${accent ? 'text-red' : 'text-ink'}`}>
        {countTo != null && format ? <CountUp value={countTo} format={format} /> : value}
      </p>
    </div>
  );
}
