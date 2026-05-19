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
      background: '#0a0a0f',
      color: '#e8e0d0',
      fontFamily: 'var(--font-dm-sans), sans-serif',
      padding: '0',
    }}>
      {/* Header */}
      <header style={{
        borderBottom: '1px solid #1e1e2e',
        padding: '2rem 4rem',
        display: 'flex',
        alignItems: 'baseline',
        gap: '1rem',
      }}>
        <h1 style={{
          fontFamily: 'var(--font-playfair), serif',
          fontSize: '2rem',
          fontWeight: 900,
          color: '#f5c842',
          margin: 0,
          letterSpacing: '-0.02em',
        }}>BOXCAST</h1>
        <span style={{ color: '#444', fontSize: '0.85rem', letterSpacing: '0.15em' }}>
          BOX OFFICE PREDICTOR
        </span>
      </header>

      <div style={{ display: 'flex', minHeight: 'calc(100vh - 81px)' }}>

        {/* Movie Grid */}
        <section style={{
          width: selected ? '420px' : '100%',
          padding: '3rem 4rem',
          transition: 'width 0.4s ease',
          overflowY: 'auto',
          borderRight: selected ? '1px solid #1e1e2e' : 'none',
        }}>
          <p style={{ color: '#555', fontSize: '0.8rem', letterSpacing: '0.2em', marginBottom: '2rem' }}>
            NOW IN THEATERS — {movies.length} FILMS
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: selected ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: '1rem',
            transition: 'all 0.4s ease',
          }}>
            {movies.map(movie => (
              <div
                key={movie.tmdb_id}
                onClick={() => handleSelect(movie)}
                style={{
                  cursor: 'pointer',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  border: selected?.tmdb_id === movie.tmdb_id ? '2px solid #f5c842' : '2px solid transparent',
                  transition: 'all 0.2s ease',
                  position: 'relative',
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
                  background: 'linear-gradient(transparent, rgba(0,0,0,0.9))',
                  padding: '2rem 0.75rem 0.75rem',
                }}>
                  <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 500, lineHeight: 1.3 }}>
                    {movie.title}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Detail Panel */}
        {selected && (
          <section style={{
            flex: 1,
            padding: '3rem 4rem',
            overflowY: 'auto',
          }}>
            <button
              onClick={() => { setSelected(null); setPrediction(null); }}
              style={{
                background: 'none', border: 'none', color: '#555',
                cursor: 'pointer', fontSize: '0.8rem', letterSpacing: '0.1em',
                marginBottom: '2rem', padding: 0,
              }}
            >
              ← BACK
            </button>

            <div style={{ display: 'flex', gap: '2rem', marginBottom: '3rem' }}>
              <img
                src={selected.poster}
                alt={selected.title}
                style={{ width: '140px', borderRadius: '4px', flexShrink: 0 }}
              />
              <div>
                <h2 style={{
                  fontFamily: 'var(--font-playfair), serif',
                  fontSize: '1.8rem',
                  fontWeight: 700,
                  margin: '0 0 0.5rem',
                  lineHeight: 1.2,
                }}>{selected.title}</h2>
                <p style={{ color: '#666', fontSize: '0.85rem', margin: '0 0 1.5rem' }}>
                  {selected.release_date}
                </p>
                <p style={{ color: '#999', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>
                  {selected.overview}
                </p>
              </div>
            </div>

            {!prediction && (
              <button
                onClick={handlePredict}
                disabled={predicting}
                style={{
                  background: predicting ? '#333' : '#f5c842',
                  color: predicting ? '#666' : '#0a0a0f',
                  border: 'none',
                  padding: '1rem 2.5rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  letterSpacing: '0.15em',
                  cursor: predicting ? 'not-allowed' : 'pointer',
                  borderRadius: '2px',
                  transition: 'all 0.2s',
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
                  background: '#1e1e2e',
                  marginBottom: '3rem',
                  border: '1px solid #1e1e2e',
                }}>
                  {[
                    { label: 'OPENING WEEKEND', value: fmt(prediction.opening_weekend) },
                    { label: 'PREDICTED TOTAL', value: fmt(prediction.predicted_revenue), highlight: true },
                    { label: 'DECAY RATE λ', value: prediction.decay_curve?.decay_rate ?? 'N/A' },
                  ].map(stat => (
                    <div key={stat.label} style={{
                      background: '#0a0a0f',
                      padding: '1.5rem',
                      textAlign: 'center',
                    }}>
                      <p style={{ margin: '0 0 0.5rem', fontSize: '0.7rem', color: '#555', letterSpacing: '0.15em' }}>
                        {stat.label}
                      </p>
                      <p style={{
                        margin: 0,
                        fontSize: '1.5rem',
                        fontFamily: 'var(--font-playfair), serif',
                        color: stat.highlight ? '#f5c842' : '#e8e0d0',
                        fontWeight: 700,
                      }}>
                        {stat.value}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Decay Curve */}
                {prediction.decay_curve && prediction.decay_curve.weeks.length > 2 && (
                  <div>
                    <p style={{ color: '#555', fontSize: '0.75rem', letterSpacing: '0.2em', marginBottom: '1.5rem' }}>
                      WEEKEND GROSS DECAY
                    </p>
                    <DecayCurve data={prediction.decay_curve} />
                  </div>
                )}

                {prediction.decay_curve && prediction.decay_curve.weeks.length <= 2 && (
                  <p style={{ color: '#444', fontSize: '0.85rem', fontStyle: 'italic' }}>
                    Not enough weekly data yet — check back after a few more weekends.
                  </p>
                )}
              </div>
            )}

            {prediction?.error && (
              <p style={{ color: '#c0392b', fontSize: '0.9rem' }}>
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
  const height = 280;
  const pad = { top: 20, right: 20, bottom: 40, left: 60 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const xScale = (w: number) => (w / maxWeek) * innerW;
  const yScale = (g: number) => innerH - (g / maxGross) * innerH;

  const fittedPath = fitted_weeks.map((w, i) =>
    `${i === 0 ? 'M' : 'L'}${xScale(w)},${yScale(fitted_gross[i])}`
  ).join(' ');

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <g transform={`translate(${pad.left},${pad.top})`}>
        {[0.25, 0.5, 0.75, 1].map(t => (
          <line key={t}
            x1={0} y1={yScale(maxGross * t)}
            x2={innerW} y2={yScale(maxGross * t)}
            stroke="#1e1e2e" strokeWidth={1}
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
              fill="#f5c842"
              opacity={0.7}
            />
          );
        })}

        <path d={fittedPath} fill="none" stroke="#f5c842" strokeWidth={2} opacity={0.4} strokeDasharray="4 2" />

        <line x1={0} y1={innerH} x2={innerW} y2={innerH} stroke="#333" />
        {weeks.map(w => (
          <text key={w} x={xScale(w)} y={innerH + 18}
            textAnchor="middle" fill="#555" fontSize={11}>
            Wk {w + 1}
          </text>
        ))}

        {[0, 0.5, 1].map(t => (
          <text key={t} x={-8} y={yScale(maxGross * t) + 4}
            textAnchor="end" fill="#555" fontSize={11}>
            ${(maxGross * t / 1e6).toFixed(0)}M
          </text>
        ))}
      </g>
    </svg>
  );
}
