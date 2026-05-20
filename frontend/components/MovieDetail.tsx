import type { Movie, Prediction } from './types';
import { StatCard } from './StatCard';
import { DecayCurve } from './DecayCurve';

const fmt = (n: number) =>
  '$' + (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : (n / 1e6).toFixed(1) + 'M');

function weeksAgo(dateStr: string): number | null {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const w = Math.floor((Date.now() - d.getTime()) / (7 * 24 * 60 * 60 * 1000));
    return w > 0 ? w : null;
  } catch { return null; }
}

interface MovieDetailProps {
  selected: Movie;
  prediction: Prediction | null;
  predicting: boolean;
  onBack: () => void;
  onPredict: () => void;
  fullPage?: boolean;
}

export function MovieDetail({ selected, prediction, predicting, onBack, onPredict, fullPage }: MovieDetailProps) {
  const weeks = weeksAgo(selected.release_date);
  const posterSize = fullPage ? 180 : 140;

  return (
    <section
      className="detail-panel"
      style={{
        flex: fullPage ? undefined : 1,
        padding: '3rem 4rem',
        overflowY: fullPage ? undefined : 'auto',
        position: 'relative',
      }}
    >
      {/* Blurred poster backdrop — full-page mode only */}
      {fullPage && (
        <div aria-hidden="true" style={{
          position: 'absolute',
          top: 0, right: 0,
          width: '55%',
          height: '100%',
          backgroundImage: `url(${selected.poster})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center 15%',
          filter: 'blur(80px) saturate(0.7)',
          opacity: 0.07,
          pointerEvents: 'none',
          zIndex: 0,
        }} />
      )}

      <div style={{ position: 'relative', zIndex: 1 }}>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(220, 244, 233, 0.32)',
            cursor: 'pointer',
            fontSize: '0.75rem',
            letterSpacing: '0.15em',
            marginBottom: '2rem',
            padding: 0,
            fontFamily: 'var(--font-dm-sans), sans-serif',
            fontWeight: 500,
            transition: 'color 0.2s',
          }}
        >
          ← {fullPage ? 'ALL FILMS' : 'BACK'}
        </button>

        <div style={{ display: 'flex', gap: '2rem', marginBottom: '2.5rem' }}>
          <img
            src={selected.poster}
            alt={selected.title}
            style={{
              width: posterSize,
              borderRadius: '6px',
              flexShrink: 0,
              boxShadow: fullPage
                ? '0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(40,220,136,0.12)'
                : '0 8px 36px rgba(0,0,0,0.55), 0 0 0 1px rgba(40,220,136,0.1)',
            }}
          />
          <div>
            <h2 style={{
              fontFamily: 'var(--font-playfair), serif',
              fontSize: fullPage ? '2.2rem' : '1.8rem',
              fontWeight: 700,
              margin: '0 0 0.5rem',
              lineHeight: 1.15,
              color: '#DCF4E9',
            }}>
              {selected.title}
            </h2>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
              <p style={{ color: 'rgba(220, 244, 233, 0.32)', fontSize: '0.8rem', margin: 0, letterSpacing: '0.1em' }}>
                {selected.release_date}
              </p>
              {weeks !== null && (
                <span style={{
                  fontSize: '0.58rem',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  color: 'rgba(40, 220, 136, 0.75)',
                  background: 'rgba(40, 220, 136, 0.08)',
                  border: '1px solid rgba(40, 220, 136, 0.18)',
                  borderRadius: '100px',
                  padding: '0.15rem 0.65rem',
                  whiteSpace: 'nowrap',
                }}>
                  {weeks}W IN THEATERS
                </span>
              )}
            </div>

            {selected.genres && selected.genres.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '1.25rem' }}>
                {selected.genres.map(g => (
                  <span key={g} style={{
                    fontSize: '0.62rem',
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    color: 'rgba(40, 220, 136, 0.7)',
                    background: 'rgba(40, 220, 136, 0.08)',
                    border: '1px solid rgba(40, 220, 136, 0.15)',
                    borderRadius: '100px',
                    padding: '0.2rem 0.6rem',
                  }}>
                    {g}
                  </span>
                ))}
              </div>
            )}

            <p style={{ color: 'rgba(220, 244, 233, 0.52)', fontSize: '0.9rem', lineHeight: 1.7, margin: 0 }}>
              {selected.overview}
            </p>
          </div>
        </div>

        {/* Visual separator */}
        <div style={{
          height: 1,
          background: 'linear-gradient(90deg, rgba(40,220,136,0.14) 0%, rgba(40,220,136,0.04) 55%, transparent 100%)',
          marginBottom: '2rem',
        }} />

        {/* Predict button */}
        {!prediction && !predicting && (
          <button
            onClick={onPredict}
            className="predict-btn"
            style={{
              background: '#28DC88',
              color: '#040C09',
              border: '1px solid transparent',
              padding: '1rem 2.5rem',
              fontSize: '0.8rem',
              fontWeight: 700,
              letterSpacing: '0.16em',
              cursor: 'pointer',
              borderRadius: '3px',
              transition: 'background 0.2s, color 0.2s',
              fontFamily: 'var(--font-dm-sans), sans-serif',
            }}
          >
            PREDICT TOTAL GROSS →
          </button>
        )}

        {/* Circular green loading animation */}
        {!prediction && predicting && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', padding: '0.5rem 0' }}>
            <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
              {/* Outer spinning arc */}
              <div style={{
                position: 'absolute', inset: 0,
                borderRadius: '50%',
                border: '1.5px solid rgba(40,220,136,0.12)',
                borderTopColor: '#28DC88',
                borderRightColor: 'rgba(40,220,136,0.45)',
                animation: 'spinArc 1.1s linear infinite',
              }} />
              {/* Inner counter-spinning arc */}
              <div style={{
                position: 'absolute', inset: 10,
                borderRadius: '50%',
                border: '1px solid rgba(40,220,136,0.08)',
                borderBottomColor: '#28DC88',
                borderLeftColor: 'rgba(40,220,136,0.3)',
                animation: 'spinArc 0.75s linear infinite reverse',
              }} />
              {/* Expanding pulse ring 1 */}
              <div style={{
                position: 'absolute', inset: 20,
                borderRadius: '50%',
                border: '1px solid rgba(40,220,136,0.55)',
                animation: 'pulseRing 2s ease-out infinite',
              }} />
              {/* Expanding pulse ring 2 (offset) */}
              <div style={{
                position: 'absolute', inset: 20,
                borderRadius: '50%',
                border: '1px solid rgba(40,220,136,0.55)',
                animation: 'pulseRing 2s ease-out 1s infinite',
              }} />
            </div>
            <div>
              <span style={{
                fontSize: '0.72rem',
                letterSpacing: '0.25em',
                color: '#28DC88',
                fontWeight: 700,
                fontFamily: 'var(--font-dm-sans), sans-serif',
                display: 'block',
                marginBottom: '0.3rem',
                textShadow: '0 0 20px rgba(40,220,136,0.4)',
              }}>
                ANALYZING...
              </span>
              <span style={{
                fontSize: '0.6rem',
                letterSpacing: '0.15em',
                color: 'rgba(220, 244, 233, 0.28)',
                fontFamily: 'var(--font-dm-sans), sans-serif',
              }}>
                MODELING BOX OFFICE TRAJECTORY
              </span>
            </div>
          </div>
        )}

        {prediction && !prediction.error && (
          <div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '1px',
              background: 'rgba(40, 220, 136, 0.07)',
              marginBottom: '3rem',
              border: '1px solid rgba(40, 220, 136, 0.07)',
              borderRadius: '8px',
              overflow: 'hidden',
            }}>
              <StatCard label="OPENING WEEKEND" value={fmt(prediction.opening_weekend)} />
              <StatCard label="PREDICTED TOTAL" value={fmt(prediction.predicted_revenue)} highlight />
              <StatCard label="DECAY RATE λ" value={prediction.decay_curve?.decay_rate ?? 'N/A'} accent />
            </div>

            {prediction.decay_curve && prediction.decay_curve.weeks.length > 2 && (
              <div>
                <p style={{ color: 'rgba(220, 244, 233, 0.28)', fontSize: '0.72rem', letterSpacing: '0.22em', marginBottom: '1.5rem', fontWeight: 600 }}>
                  WEEKEND GROSS DECAY
                </p>
                <DecayCurve data={prediction.decay_curve} />
              </div>
            )}

            {prediction.decay_curve && prediction.decay_curve.weeks.length <= 2 && (
              <p style={{ color: 'rgba(220, 244, 233, 0.25)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                Not enough weekly data yet — check back after a few more weekends.
              </p>
            )}
          </div>
        )}

        {prediction?.error && (
          <p style={{ color: '#DC287C', fontSize: '0.9rem' }}>
            Could not fetch data for this movie. It may not have box office data yet.
          </p>
        )}
      </div>
    </section>
  );
}
