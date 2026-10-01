import type { Metadata } from 'next';
import { RunningHead } from '@/components/RunningHead';
import { CopyCode } from '@/components/CopyCode';
import { API_URL } from '@/lib/api';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Free Box Office Prediction API',
  description:
    'A free box-office forecast API: predicted worldwide gross for films now playing, forecast ranges, and the settled record of past predictions. JSON, no key, CORS open.',
  alternates: { canonical: '/api-docs' },
  openGraph: { title: 'Free Box Office Prediction API · MOVIEGROSS', type: 'website' },
};

// What a search engine reads as "this page documents a web API".
const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebAPI',
  name: 'MOVIEGROSS Box-Office Forecast API',
  description:
    'Free, read-only box-office forecasts: predicted worldwide gross and range for films now playing, and the settled record of past predictions.',
  url: `${SITE_URL}/api-docs`,
  documentation: `${SITE_URL}/api-docs`,
  termsOfService: `${SITE_URL}/api-docs`,
  provider: { '@type': 'Organization', name: 'MOVIEGROSS', url: SITE_URL },
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
    {
      "week": 1,
      "us_to_date": 360091572,
      "forecast": 1979184510,
      "low": 1618799615,
      "high": 2382820562
    },
    { "week": 2, "us_to_date": 654342914, "forecast": 2925919450 }
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

const CURL_EXAMPLE = `curl ${BASE}/films`;

const FETCH_EXAMPLE = `const res = await fetch("${BASE}/films");
const { films } = await res.json();
console.log(films[0].title, films[0].predicted_total);`;

function Endpoint({ path, id, children }: { path: string; id: string; children: React.ReactNode }) {
  const isPath = path.startsWith('/');
  return (
    <section id={id} className="mt-12 scroll-mt-6">
      {isPath ? (
        <h2 className="font-mono text-ink text-[1.05rem] sm:text-[1.2rem] font-bold m-0 break-all">{`GET ${path}`}</h2>
      ) : (
        <h2 className="font-display text-ink text-[1.4rem] font-bold m-0">{path}</h2>
      )}
      <div className="rule-hair mt-2 mb-3" />
      {children}
    </section>
  );
}

// Ruled name | meaning rows; `mono` names are field names or status codes.
function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="text-[0.9rem] leading-[1.6] m-0 mt-4 border-t border-ink/25">
      {rows.map(([k, v]) => (
        <div key={k} className="grid sm:grid-cols-[13rem_1fr] sm:gap-4 py-2 border-b border-ink/15">
          <dt className="font-mono text-ink break-words">{k}</dt>
          <dd className="m-0 text-ink2">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const EMBED = `<iframe src="${SITE_URL}/embed/969681"
        width="360" height="190" style="border:0" title="MOVIEGROSS forecast"></iframe>`;

const P = 'text-ink2 text-[0.9rem] leading-[1.65] max-w-prose m-0 mb-3';

const FACTS: [string, React.ReactNode][] = [
  ['Base address', <span key="b" className="font-mono text-ink break-all">{BASE}</span>],
  ['Auth', 'None. No key, open to every website (CORS).'],
  ['Rate limit', '10 requests a minute, 200 a day, per visitor. Past that: 429.'],
  ['Caching', 'Answers are cached for five minutes, so asking more often gains nothing.'],
  ['Format', 'JSON. Money is US dollars, whole numbers; a total is the worldwide gross.'],
  ['Stability', 'These shapes will not change. New fields may be added; none removed or renamed.'],
];

export default function ApiDocsPage() {
  return (
    <main id="main" tabIndex={-1} className="min-h-screen text-ink font-sans">
      <RunningHead stamp={false} />
      <div className="px-4 sm:px-8 lg:px-14 pt-9 pb-24 max-w-[74rem] mx-auto w-full">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
        <h1 className="font-display text-ink text-[2rem] sm:text-[2.6rem] font-bold leading-none m-0 mb-3">Box-Office Forecast API</h1>
        <p className={P}>
          A free box-office prediction API: the model&rsquo;s forecasts of each film&rsquo;s worldwide gross, as JSON.
          Read-only, no key, open to every website.
        </p>
        <div className="rule-double mb-2" />

        <div className="max-w-3xl">
            <section id="start" className="mt-8 scroll-mt-6">
              <h2 className="font-display text-ink text-[1.4rem] font-bold m-0 mb-2">Quick start</h2>
              <CopyCode label="curl example">{CURL_EXAMPLE}</CopyCode>
              <CopyCode label="JavaScript example">{FETCH_EXAMPLE}</CopyCode>
              <dl className="text-[0.9rem] leading-[1.6] m-0 mt-5 border-t border-ink/25">
                {FACTS.map(([k, v]) => (
                  <div key={k} className="grid sm:grid-cols-[9rem_1fr] sm:gap-4 py-2 border-b border-ink/15">
                    <dt className="font-semibold text-ink">{k}</dt>
                    <dd className="m-0 text-ink2 min-w-0">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className={`${P} mt-4`}>
                Forecasts are estimates, not facts: a film&rsquo;s <code className="font-mono">range</code> is where half
                of films like it finished. A link to MOVIEGROSS where you show the numbers is appreciated. Only forecasts
                are offered, with no posters or synopses; those belong to TMDB, so use the{' '}
                <code className="font-mono">tmdb_id</code> to fetch them from there.
              </p>
            </section>

            <Endpoint id="films" path="/v1/films">
              <p className={P}>
                Every film now playing that has a forecast, largest forecast first. A film appears once its opening weekend
                is in, which is when a forecast becomes possible.
              </p>
              <CopyCode label="Example response from /v1/films">{FILMS_EXAMPLE}</CopyCode>
              <Rows rows={[
                ['predicted_total', 'The forecast worldwide gross, in dollars.'],
                ['opening_weekend', 'The US opening weekend the forecast was made from.'],
              ]} />
            </Endpoint>

            <Endpoint id="film" path="/v1/films/{tmdb_id}">
              <p className={P}>
                One film&rsquo;s forecast, the range around it, and the call as it stood after each US weekend. Only films
                MOVIEGROSS has already forecast; any other id answers 404 <code className="font-mono">no_forecast</code>.
              </p>
              <CopyCode label="Example response from /v1/films/{tmdb_id}">{FILM_EXAMPLE}</CopyCode>
              <Rows rows={[
                ['status', '"in_theaters" while the run is open, "settled" once it has ended.'],
                ['predicted_total', 'The forecast worldwide gross, in dollars.'],
                ['range', '[low, high] around predicted_total, or null when none can be made.'],
                ['opening_weekend', 'The US opening weekend the forecast was made from.'],
                ['actual_total', 'The total the run settled at; null while it is still open.'],
                ['forecasts_by_weekend', 'The call after each US weekend (week 1 is the opening), with its own low and high and the US gross to date.'],
              ]} />
            </Endpoint>

            <Endpoint id="ledger" path="/v1/ledger">
              <p className={P}>
                Films whose runs have ended: the call made after the opening weekend beside the total they settled at, so
                the model&rsquo;s record can be checked rather than taken on trust.
              </p>
              <CopyCode label="Example response from /v1/ledger">{LEDGER_EXAMPLE}</CopyCode>
              <Rows rows={[
                ['predicted_total', 'The call made after the opening weekend.'],
                ['actual_total', 'The worldwide gross the run settled at.'],
                ['later_forecasts', 'Maps a US weekend (2, 4 or 8) to the call made after it, for the weekends that run reached.'],
              ]} />
            </Endpoint>

            <Endpoint id="embed" path="Embed a film">
              <p className={P}>
                Don&rsquo;t want to write code? Paste this into any web page to show a film&rsquo;s forecast as a small box
                (swap in the film&rsquo;s <code className="font-mono">tmdb_id</code>, the number at the end of its page address
                here). It links back to the film&rsquo;s page.
              </p>
              <CopyCode label="Embed snippet">{EMBED}</CopyCode>
              <p className="font-sans text-ink2 text-[0.75rem] font-semibold tracking-[0.12em] uppercase m-0 mt-5 mb-2">Live preview</p>
              <iframe
                src="/embed/969681"
                width={360}
                height={190}
                title="MOVIEGROSS forecast"
                className="border-0 max-w-full"
              />
            </Endpoint>

            <Endpoint id="errors" path="Errors">
              <p className={P}>
                Errors are JSON with an <code className="font-mono">error</code> message and a{' '}
                <code className="font-mono">code</code>.
              </p>
              <Rows rows={[
                ['404 no_forecast', 'No forecast for that film (yet). Only films with an opening weekend have one; don\u2019t retry.'],
                ['429 rate_limited', 'Over the limit. Wait the number of seconds in the Retry-After header, then ask again.'],
                ['503 unavailable', 'The forecast store is briefly unreachable. Try again in a minute.'],
              ]} />
            </Endpoint>

            <div className="mt-12">
              <a href="/openapi.json" className="ledger-btn inline-block no-underline font-mono text-[0.75rem] tracking-[0.14em] uppercase px-5 py-3">
                OpenAPI spec
              </a>
            </div>
        </div>
      </div>
    </main>
  );
}
