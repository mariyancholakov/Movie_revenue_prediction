interface StatCardProps {
  label: string;
  value: string | number;
  highlight?: boolean;
  accent?: boolean;
}

export function StatCard({ label, value, highlight = false, accent = false }: StatCardProps) {
  return (
    <div className="flex flex-col items-center justify-center py-4 sm:py-7 px-3 sm:px-5 text-center">
      <p className="text-[0.55rem] sm:text-[0.58rem] font-semibold tracking-[0.22em] text-cream/30 uppercase mb-2 sm:mb-3">
        {label}
      </p>
      <p
        className={`text-[1.55rem] sm:text-[2.1rem] font-bold font-sans leading-none tabular-nums ${
          highlight ? 'text-green' : accent ? 'text-pink' : 'text-cream'
        }`}
        style={
          highlight
            ? { textShadow: '0 0 32px rgba(40,220,136,0.45)' }
            : accent
            ? { textShadow: '0 0 24px rgba(220,40,124,0.35)' }
            : undefined
        }
      >
        {value}
      </p>
    </div>
  );
}
