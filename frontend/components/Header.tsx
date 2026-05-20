import Link from 'next/link';

export function Header() {
  return (
    <header style={{
      borderBottom: '1px solid rgba(40, 220, 136, 0.1)',
      padding: '2rem 4rem',
      display: 'flex',
      alignItems: 'baseline',
      gap: '1rem',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      background: 'rgba(4, 12, 9, 0.92)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
    }}>
      <Link href="/" style={{ textDecoration: 'none' }}>
        <h1 style={{
          fontFamily: 'var(--font-playfair), serif',
          fontSize: '2rem',
          fontWeight: 900,
          color: '#28DC88',
          margin: 0,
          letterSpacing: '-0.02em',
          textShadow: '0 0 40px rgba(40, 220, 136, 0.28)',
          cursor: 'pointer',
          transition: 'opacity 0.2s',
        }}>BOXCAST</h1>
      </Link>
      <span style={{ color: 'rgba(220, 244, 233, 0.28)', fontSize: '0.75rem', letterSpacing: '0.22em', fontWeight: 500 }}>
        BOX OFFICE PREDICTOR
      </span>
    </header>
  );
}
