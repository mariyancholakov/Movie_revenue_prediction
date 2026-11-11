import { Typed } from './Typed';

interface StatCardProps {
  label: string;
  value: string;
  /** negative reading ("in the red") — over budget / miss */
  accent?: boolean;
}

// Every figure in the prediction ledger is set the same way (one face, one
// size, one weight) with its label above, so a row of them reads as a row.
// The figure is typewritten; MovieDetail's reveal strikes it key by key.
export function StatCard({ label, value, accent = false }: StatCardProps) {
  return (
    <div className="flex flex-col justify-between gap-3 py-5 px-3 min-[360px]:px-4 sm:px-6 h-full">
      <p className="font-sans text-label font-medium text-ink2 m-0">
        {label}
      </p>
      <p
        data-figure
        className={`self-start font-mono text-lead min-[360px]:text-title sm:text-section font-normal leading-none tabular-nums m-0 ${accent ? 'text-red' : 'text-ink'}`}
      >
        <Typed text={value} />
      </p>
    </div>
  );
}
