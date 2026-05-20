'use client';
import { useState, useEffect } from 'react';

interface Movie {
  tmdb_id: number;
  title: string;
  poster: string;
  release_date: string;
  overview: string;
}

interface DecayCurveData {
  weeks: number[];
  actual_gross: number[];
  fitted_weeks: number[];
  fitted_gross: number[];
  decay_rate: number;
}

interface Prediction {
  opening_weekend: number;
  predicted_revenue: number;
  decay_curve?: DecayCurveData;
  error?: string;
}

export default function Home() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [selected, setSelected] = useState<Movie | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [predicting, setPredicting] = useState(false);

  useEffect(() => {
    fetch('http://127.0.0.1:5000/api/now-playing')
      .then(r => r.json())
      .then(setMovies)
      .catch(() => setMovies([]));
  }, []);

  const handleSelect = (movie: Movie) => {
    setSelected(movie);
    setPrediction(null);
  };

  const handlePredict = async () => {
    if (!selected) return;
    setPredicting(true);
    try {
      const res = await fetch('http://127.0.0.1:5000/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tmdb_id: selected.tmdb_id }),
      });
      const data = await res.json();
      setPrediction(data);
    } catch {
      setPrediction({ opening_weekend: 0, predicted_revenue: 0, error: 'Request failed' });
    } finally {
      setPredicting(false);
    }
  };

  const fmt = (n: number) => '$' + (n >= 1e9
    ? (n / 1e9).toFixed(2) + 'B'
    : (n / 1e6).toFixed(1) + 'M');

  return (
    <main style={{
      minHeight: '100vh',
      background: '#040C09',
      color: '#DCF4E9',
      fontFamily: 'var(--font-dm-sans), sans-serif',
      padding: '0',
    }}>
      {/* Header */}
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
        <h1 style={{
          fontFamily: 'var(--font-playfair), serif',
          fontSize: '2rem',
          fontWeight: 900,
          color: '#28DC88',
          margin: 0,
          letterSpacing: '-0.02em',
          textShadow: '0 0 40px rgba(40, 220, 136, 0.28)',
        }}>BOXCAST</h1>
        <span style={{ color: 'rgba(220, 244, 233, 0.28)', fontSize: '0.75rem', letterSpacing: '0.22em', fontWeight: 500 }}>
          BOX OFFICE PREDICTOR
        </span>
      </header>

      <div style={{ display: 'flex', minHeight: 'calc(100vh - 81px)' }}>

        {/* Movie Grid */}
        <section style={{
          width: selected ? '420px' : '100%',
          padding: '3rem 4rem',
          transition: 'width 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
          overflowY: 'auto',
          borderRight: selected ? '1px solid rgba(40, 220, 136, 0.08)' : 'none',
        }}>
          <p style={{ color: 'rgba(220, 244, 233, 0.28)', fontSize: '0.72rem', letterSpacing: '0.22em', marginBottom: '2rem', fontWeight: 600 }}>
            NOW IN THEATERS — {movies.length} FILMS
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: selected ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: '1rem',
            transition: 'all 0.4s ease',
          }}>
            {movies.length === 0 && Array.from({ length: 12 }).map((_, i) => (
              <div key={`sk-${i}`} className="skeleton-card" />
            ))}
            {movies.map((movie, index) => (
              <div
                key={movie.tmdb_id}
                onClick={() => handleSelect(movie)}
                className="movie-card"
                style={{
                  borderRadius: '6px',
                  overflow: 'hidden',
                  border: selected?.tmdb_id === movie.tmdb_id ? '2px solid #28DC88' : '2px solid transparent',
                  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                  position: 'relative',
                  animationDelay: `${index * 0.04}s`,
                  boxShadow: selected?.tmdb_id === movie.tmdb_id
                    ? '0 0 0 4px rgba(80, 38, 123, 0.35), 0 8px 28px rgba(40, 220, 136, 0.18)'
                    : 'none',
                }}
              >
                <img
                  src={movie.poster}
                  alt={movie.title}
                  style={{ width: '100%', display: 'block', aspectRatio: '2/3', objectFit: 'cover' }}
                />
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: 'linear-gradient(transparent, rgba(4, 12, 9, 0.96))',
                  padding: '2rem 0.75rem 0.75rem',
                }}>
                  <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 500, lineHeight: 1.3, color: '#DCF4E9' }}>
                    {movie.title}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Detail Panel */}
        {selected && (
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
              onClick={() => { setSelected(null); setPrediction(null); }}
              style={{
                background: 'none', border: 'none',
                color: 'rgba(220, 244, 233, 0.32)',
                cursor: 'pointer', fontSize: '0.75rem', letterSpacing: '0.15em',
                marginBottom: '2rem', padding: 0,
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
                }}>{selected.title}</h2>
                <p style={{ color: 'rgba(220, 244, 233, 0.32)', fontSize: '0.8rem', margin: '0 0 1.5rem', letterSpacing: '0.1em' }}>
                  {selected.release_date}
                </p>
                <p style={{ color: 'rgba(220, 244, 233, 0.52)', fontSize: '0.9rem', lineHeight: 1.7, margin: 0 }}>
                  {selected.overview}
                </p>
              </div>
            </div>

            {!prediction && (
              <button
                onClick={handlePredict}
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
                {/* Stats Row */}
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
                  {[
                    { label: 'OPENING WEEKEND', value: fmt(prediction.opening_weekend), accent: false, highlight: false },
                    { label: 'PREDICTED TOTAL', value: fmt(prediction.predicted_revenue), highlight: true, accent: false },
                    { label: 'DECAY RATE λ', value: prediction.decay_curve?.decay_rate ?? 'N/A', accent: true, highlight: false },
                  ].map(stat => (
                    <div key={stat.label} style={{
                      background: stat.highlight ? 'rgba(40, 220, 136, 0.07)' : '#050E0A',
                      padding: '1.75rem 1.25rem',
                      textAlign: 'center',
                    }}>
                      <p style={{ margin: '0 0 0.6rem', fontSize: '0.65rem', color: 'rgba(220, 244, 233, 0.32)', letterSpacing: '0.2em', fontWeight: 600 }}>
                        {stat.label}
                      </p>
                      <p style={{
                        margin: 0,
                        fontSize: '1.55rem',
                        fontFamily: 'var(--font-playfair), serif',
                        color: stat.highlight ? '#28DC88' : stat.accent ? '#DC287C' : '#DCF4E9',
                        fontWeight: 700,
                        textShadow: stat.highlight ? '0 0 24px rgba(40, 220, 136, 0.3)' : stat.accent ? '0 0 20px rgba(220, 40, 124, 0.25)' : 'none',
                      }}>
                        {stat.value}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Decay Curve */}
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
        )}
      </div>
    </main>
  );
}

interface DecayCurveProps {
  data: DecayCurveData;
}

function DecayCurve({ data }: DecayCurveProps) {
  const { weeks, actual_gross, fitted_weeks, fitted_gross } = data;
  const maxGross = Math.max(...actual_gross, ...fitted_gross);
  const maxWeek = Math.max(...weeks, ...fitted_weeks);

  if (maxGross === 0 || maxWeek === 0) return null;

  const width = 600;
  const height = 300;
  const pad = { top: 40, right: 24, bottom: 52, left: 68 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const xScale = (w: number) => (w / maxWeek) * innerW;
  const yScale = (g: number) => innerH - (g / maxGross) * innerH;

  const fittedPath = fitted_weeks.map((w, i) =>
    `${i === 0 ? 'M' : 'L'}${xScale(w)},${yScale(fitted_gross[i])}`
  ).join(' ');

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="decay-bar-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#28DC88" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#28DC88" stopOpacity="0.3" />
        </linearGradient>
      </defs>

      <g transform={`translate(${pad.left},${pad.top})`}>

        {/* Legend */}
        <g transform={`translate(${innerW - 148}, -32)`}>
          <rect x={0} y={2} width={11} height={11} fill="url(#decay-bar-grad)" rx={2} />
          <text x={17} y={12} fill="rgba(220,244,233,0.4)" fontSize={10} fontFamily="var(--font-dm-sans), sans-serif">Actual Gross</text>
          <line x1={100} y1={7} x2={118} y2={7} stroke="#DC287C" strokeWidth={2} strokeDasharray="4 2" />
          <text x={124} y={12} fill="rgba(220,244,233,0.4)" fontSize={10} fontFamily="var(--font-dm-sans), sans-serif">Fitted</text>
        </g>

        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1].map(t => (
          <line key={t}
            x1={0} y1={yScale(maxGross * t)}
            x2={innerW} y2={yScale(maxGross * t)}
            stroke="rgba(220,244,233,0.05)" strokeWidth={1}
          />
        ))}

        {/* Bars */}
        {weeks.map((w, i) => {
          const barW = Math.max(innerW / maxWeek * 0.6, 8);
          return (
            <rect key={w}
              x={xScale(w) - barW / 2}
              y={yScale(actual_gross[i])}
              width={barW}
              height={innerH - yScale(actual_gross[i])}
              fill="url(#decay-bar-grad)"
              rx={3}
            />
          );
        })}

        {/* Fitted curve — accent pink */}
        <path d={fittedPath} fill="none" stroke="#DC287C" strokeWidth={2.5} strokeDasharray="5 3" strokeLinecap="round" />

        {/* Axes */}
        <line x1={0} y1={innerH} x2={innerW} y2={innerH} stroke="rgba(220,244,233,0.14)" />
        <line x1={0} y1={0} x2={0} y2={innerH} stroke="rgba(220,244,233,0.14)" />

        {/* X ticks */}
        {weeks.map(w => (
          <text key={w} x={xScale(w)} y={innerH + 20}
            textAnchor="middle" fill="rgba(220,244,233,0.32)" fontSize={10} fontFamily="var(--font-dm-sans), sans-serif">
            Wk {w + 1}
          </text>
        ))}

        {/* X axis label */}
        <text x={innerW / 2} y={innerH + 42} textAnchor="middle" fill="rgba(220,244,233,0.18)" fontSize={9} letterSpacing="0.15em" fontFamily="var(--font-dm-sans), sans-serif">
          WEEK
        </text>

        {/* Y ticks */}
        {[0, 0.5, 1].map(t => (
          <text key={t} x={-10} y={yScale(maxGross * t) + 4}
            textAnchor="end" fill="rgba(220,244,233,0.32)" fontSize={10} fontFamily="var(--font-dm-sans), sans-serif">
            ${(maxGross * t / 1e6).toFixed(0)}M
          </text>
        ))}

        {/* Y axis label */}
        <text
          x={-50}
          y={innerH / 2}
          textAnchor="middle"
          fill="rgba(220,244,233,0.18)"
          fontSize={9}
          letterSpacing="0.15em"
          fontFamily="var(--font-dm-sans), sans-serif"
          transform={`rotate(-90 -50 ${innerH / 2})`}
        >
          GROSS ($M)
        </text>

      </g>
    </svg>
  );
}
