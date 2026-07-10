interface StatCardProps {
  label: string;
  value: string | number;
  highlight?: boolean;
  accent?: boolean;
}

export function StatCard({ label, value, highlight = false, accent = false }: StatCardProps) {
  return (
    <div className="flex flex-col items-center justify-center py-4 sm:py-7 px-3 sm:px-5 text-center">
      <p className="font-mono text-[0.55rem] sm:text-[0.58rem] font-medium tracking-[0.22em] text-cream/35 uppercase mb-2.5 sm:mb-3.5">
        {label}
      </p>
      <p
        className={`text-[1.4rem] sm:text-[1.95rem] font-bold font-mono leading-none tabular-nums tracking-tight ${
          highlight ? 'text-green' : accent ? 'text-pink' : 'text-cream'
        }`}
        style={
          highlight
            ? { textShadow: '0 0 32px rgba(234,180,76,0.45)' }
            : accent
            ? { textShadow: '0 0 24px rgba(229,72,77,0.35)' }
            : undefined
        }
      >
        {value}
      </p>
    </div>
  );
}
