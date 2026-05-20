import type { Movie, Prediction } from './types';
import { StatCard } from './StatCard';
import { DecayCurve } from './DecayCurve';

const fmt = (n: number) =>
  '$' + (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : (n / 1e6).toFixed(1) + 'M');

interface MovieDetailProps {
  selected: Movie;
  prediction: Prediction | null;
  predicting: boolean;
  onBack: () => void;
  onPredict: () => void;
}

export function MovieDetail({ selected, prediction, predicting, onBack, onPredict }: MovieDetailProps) {
  return (
    <section
      className="detail-panel"
      style={{
        flex: 1,
        padding: '3rem 4rem',
        overflowY: 'auto',
        background: 'linear-gradient(160deg, rgba(80, 38, 123, 0.04) 0%, transparent 40%)',
      }}
    >
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
        ← BACK
      </button>

      <div style={{ display: 'flex', gap: '2rem', marginBottom: '3rem' }}>
        <img
          src={selected.poster}
          alt={selected.title}
          style={{
            width: '140px',
            borderRadius: '6px',
            flexShrink: 0,
            boxShadow: '0 8px 36px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(40, 220, 136, 0.1)',
          }}
        />
        <div>
          <h2 style={{
            fontFamily: 'var(--font-playfair), serif',
            fontSize: '1.8rem',
            fontWeight: 700,
            margin: '0 0 0.5rem',
            lineHeight: 1.2,
            color: '#DCF4E9',
          }}>
            {selected.title}
          </h2>
          <p style={{ color: 'rgba(220, 244, 233, 0.32)', fontSize: '0.8rem', margin: '0 0 0.6rem', letterSpacing: '0.1em' }}>
            {selected.release_date}
          </p>
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

      {!prediction && (
        <button
          onClick={onPredict}
          disabled={predicting}
          className={predicting ? undefined : 'predict-btn'}
          style={{
            background: predicting ? 'transparent' : '#28DC88',
            color: predicting ? 'rgba(220, 244, 233, 0.32)' : '#040C09',
            border: predicting ? '1px solid rgba(220, 244, 233, 0.1)' : '1px solid transparent',
            padding: '1rem 2.5rem',
            fontSize: '0.8rem',
            fontWeight: 700,
            letterSpacing: '0.16em',
            cursor: predicting ? 'not-allowed' : 'pointer',
            borderRadius: '3px',
            transition: 'background 0.2s, color 0.2s',
            fontFamily: 'var(--font-dm-sans), sans-serif',
          }}
        >
          {predicting ? 'ANALYZING...' : 'PREDICT TOTAL GROSS →'}
        </button>
      )}

      {prediction && !prediction.error && (
        <div>
          {/* Stats row */}
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

          {/* Decay curve */}
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
    </section>
  );
}
