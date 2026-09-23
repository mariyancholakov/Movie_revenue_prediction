import { Typed } from './Typed';

interface StatCardProps {
  label: string;
  value: string;
  /** negative reading ("in the red") — over budget / miss */
  accent?: boolean;
  /** the headline figure (the predicted total): spot red darkened toward ink */
  headline?: boolean;
}

// Every figure in the prediction ledger is set the same way (one face, one
// size, one weight) with its label above, so a row of them reads as a row.
// The figure is typewritten; MovieDetail's reveal strikes it key by key.
export function StatCard({ label, value, accent = false, headline = false }: StatCardProps) {
  return (
    <div className="flex flex-col justify-between gap-3 py-5 px-4 sm:px-6 h-full">
      <p className="font-mono text-[0.58rem] tracking-[0.16em] text-ink3 uppercase m-0">
        {label}
      </p>
      <p
        data-figure
        className={`self-start font-mono text-[1.25rem] sm:text-[1.6rem] font-normal leading-none tabular-nums m-0 ${accent ? 'text-red' : 'text-ink'}`}
        style={headline ? { color: 'color-mix(in srgb, var(--color-red) 72%, var(--color-ink))' } : undefined}
      >
        <Typed text={value} />
      </p>
    </div>
  );
}
