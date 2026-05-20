interface StatCardProps {
  label: string;
  value: string | number;
  highlight?: boolean;
  accent?: boolean;
}

export function StatCard({ label, value, highlight = false, accent = false }: StatCardProps) {
  return (
    <div style={{
      background: highlight ? 'rgba(40, 220, 136, 0.07)' : '#050E0A',
      padding: '1.75rem 1.25rem',
      textAlign: 'center',
    }}>
      <p style={{
        margin: '0 0 0.6rem',
        fontSize: '0.65rem',
        color: 'rgba(220, 244, 233, 0.32)',
        letterSpacing: '0.2em',
        fontWeight: 600,
      }}>
        {label}
      </p>
      <p style={{
        margin: 0,
        fontSize: '1.55rem',
        fontFamily: 'var(--font-playfair), serif',
        color: highlight ? '#28DC88' : accent ? '#DC287C' : '#DCF4E9',
        fontWeight: 700,
        textShadow: highlight
          ? '0 0 24px rgba(40, 220, 136, 0.3)'
          : accent
          ? '0 0 20px rgba(220, 40, 124, 0.25)'
          : 'none',
      }}>
        {value}
      </p>
    </div>
  );
}
