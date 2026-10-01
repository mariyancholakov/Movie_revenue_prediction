import type { Metadata } from 'next';
import { RunningHead } from '@/components/RunningHead';
import { API_URL } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Public API',
  description: "Free, read-only access to MOVIEGROSS's box-office forecasts: films now playing, one film's call and range, and the settled record.",
};

const BASE = `${API_URL}/v1`;

const FILMS_EXAMPLE = `{
  "currency": "USD",
  "credit": "Forecasts by MOVIEGROSS (https://moviegross.vercel.app). Estimates, not facts.",
  "films": [
    {
      "tmdb_id": 969681,
      "title": "Spider-Man: Brand New Day",
      "predicted_total": 2694688702,
      "opening_weekend": 360091572
    }
  ]
}`;

const FILM_EXAMPLE = `{
  "currency": "USD",
  "credit": "…",
  "tmdb_id": 969681,
  "title": "Spider-Man: Brand New Day",
  "status": "in_theaters",
  "predicted_total": 2694688931,
  "range": [2495637311, 2878250871],
  "opening_weekend": 360091572,
  "actual_total": null,
  "forecasts_by_weekend": [
    { "week": 1, "us_to_date": 360091572, "forecast": 1979184510, "low": 1618799615, "high": 2382820562 },
    { "week": 2, "us_to_date": 654342914, "forecast": 2925919450, "low": 2500045104, "high": 3139328028 }
  ]
}`;

const LEDGER_EXAMPLE = `{
  "currency": "USD",
  "credit": "…",
  "films": [
    {
      "tmdb_id": 855435,
      "title": "Faces of Death",
      "predicted_total": 3434333,
      "actual_total": 2610000,
      "later_forecasts": { "2": 2767893 }
    }
  ]
}`;

const FETCH_EXAMPLE = `const res = await fetch("${BASE}/films");
const { films } = await res.json();
console.log(films[0].title, films[0].predicted_total);`;

function Code({ children }: { children: string }) {
  return (
    <pre className="font-mono text-ink text-[0.78rem] sm:text-[0.85rem] leading-[1.6] bg-panel border border-ink/20 px-4 py-3 my-3 overflow-x-auto">
      {children}
    </pre>
  );
}

function Endpoint({ path, children }: { path: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-mono text-ink text-[1.05rem] sm:text-[1.2rem] font-bold m-0 break-all">{path.startsWith('/') ? `GET ${path}` : path}</h2>
      <div className="rule-hair mt-2 mb-3" />
      {children}
    </section>
  );
}

const P = 'text-ink2 text-[0.9rem] leading-[1.65] max-w-prose m-0 mb-3';

export default function ApiDocsPage() {
  return (
    <main id="main" tabIndex={-1} className="min-h-screen text-ink font-sans">
      <RunningHead stamp={false} />
      <div className="px-4 sm:px-8 lg:px-14 pt-9 pb-24 max-w-[74rem] mx-auto w-full">
        <h1 className="font-display text-ink text-[2rem] sm:text-[2.6rem] font-bold leading-none m-0 mb-3">Public API</h1>
        <p className={P}>
          The model&rsquo;s forecasts, as JSON. Free, read-only, no key, and open to every website. Only forecasts
          are offered: no posters or synopses, which belong to TMDB (use the <code className="font-mono">tmdb_id</code>{' '}
          to fetch those from them).
        </p>
        <div className="rule-double mb-2" />

        <section className="mt-8">
          <h2 className="font-display text-ink text-[1.4rem] font-bold m-0 mb-2">Before you start</h2>
          <ul className="text-ink2 text-[0.9rem] leading-[1.7] max-w-prose m-0 pl-5 list-disc">
            <li>
              <strong className="text-ink">Base address:</strong>{' '}
              <span className="font-mono text-ink break-all">{BASE}</span>
            </li>
            <li>
              <strong className="text-ink">Limits are strict:</strong> 10 requests a minute and 200 a day per visitor.
              Past that you get a 429; <code className="font-mono">Retry-After</code> and{' '}
              <code className="font-mono">X-RateLimit-Remaining</code> say when to come back. Answers are cached for
              five minutes, so asking more often gains nothing.
            </li>
            <li>
              <strong className="text-ink">Money</strong> is in US dollars, as whole numbers; a film&rsquo;s total is its
              worldwide gross.
            </li>
            <li>
              <strong className="text-ink">These are estimates,</strong> not facts. A film&rsquo;s{' '}
              <code className="font-mono">range</code> is where half of films like it finished.
            </li>
            <li>
              <strong className="text-ink">Credit</strong> is appreciated: a link to MOVIEGROSS where you show the numbers.
            </li>
            <li>The shape of these answers will not change. New fields may be added; none will be removed or renamed.</li>
          </ul>
          <Code>{FETCH_EXAMPLE}</Code>
        </section>

        <Endpoint path="/v1/films">
          <p className={P}>
            Every film now playing that has a forecast, largest forecast first. A film appears once its opening weekend
            is in, which is when a forecast becomes possible.
          </p>
          <Code>{FILMS_EXAMPLE}</Code>
          <p className={P}>
            <code className="font-mono">predicted_total</code> is the forecast worldwide gross;{' '}
            <code className="font-mono">opening_weekend</code> is the US opening weekend it was made from.
          </p>
        </Endpoint>

        <Endpoint path="/v1/films/{tmdb_id}">
          <p className={P}>
            One film&rsquo;s forecast, the range around it, and the call as it stood after each US weekend. Only films
            MOVIEGROSS has already forecast; any other id answers 404 <code className="font-mono">no_forecast</code>.
          </p>
          <Code>{FILM_EXAMPLE}</Code>
          <dl className="text-[0.9rem] leading-[1.65] max-w-prose m-0">
            {[
              ['status', '"in_theaters" while the run is open, "settled" once it has ended.'],
              ['range', '[low, high] around predicted_total, or null when none can be made.'],
              ['actual_total', 'The total the run settled at; null while it is still open.'],
              ['forecasts_by_weekend', 'The call after each US weekend (week 1 is the opening), with its own low and high and the US gross to date.'],
            ].map(([k, v]) => (
              <div key={k} className="flex flex-col sm:flex-row sm:gap-4 py-1">
                <dt className="font-mono text-ink sm:w-52 shrink-0">{k}</dt>
                <dd className="m-0 text-ink2">{v}</dd>
              </div>
            ))}
          </dl>
        </Endpoint>

        <Endpoint path="/v1/ledger">
          <p className={P}>
            Films whose runs have ended: the call made after the opening weekend beside the total they settled at, so
            the model&rsquo;s record can be checked rather than taken on trust.
          </p>
          <Code>{LEDGER_EXAMPLE}</Code>
          <p className={P}>
            <code className="font-mono">later_forecasts</code> maps a US weekend (2, 4 or 8) to the call made after it,
            for the weekends that run reached.
          </p>
        </Endpoint>

        <Endpoint path="Errors">
          <p className={P}>
            Errors are JSON with an <code className="font-mono">error</code> message and a{' '}
            <code className="font-mono">code</code>: <code className="font-mono">no_forecast</code> (404),{' '}
            <code className="font-mono">rate_limited</code> (429) and <code className="font-mono">unavailable</code>{' '}
            (503, try again shortly).
          </p>
        </Endpoint>
      </div>
    </main>
  );
}
