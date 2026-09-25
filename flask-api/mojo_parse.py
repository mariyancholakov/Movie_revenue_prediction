"""Parsers for Box Office Mojo pages, shared by the live API (app.py) and the
seed backfill (scripts/scrape_mojo.py) so a film priced live is read exactly
like the films the model learned from. Everything takes a parsed page
(BeautifulSoup) and never fetches.
"""
import re
from io import StringIO

import pandas as pd

def _money(text):
    text = (text or '').replace('$', '').replace(',', '').strip()
    return int(text) if text.isdigit() else None


def _int(text):
    text = re.sub(r'[^\d]', '', str(text or ''))
    return int(text) if text else None


def domestic_release_path(title):
    """The original domestic release's weekend page. The title page links its
    domestic opening figure to it."""
    for a in title.find_all('a', href=True):
        m = re.match(r'/release/(rl\d+)/weekend', a['href'])
        if m:
            return f'/release/{m.group(1)}/weekend/'
    return None


def original_group_path(title):
    """The original release group's page, or None for a single-release title
    (its title page already lists the markets)."""
    for a in title.find_all('a', href=True):
        m = re.match(r'/releasegroup/(gr\d+)/', a['href'])
        if m and a.get_text(strip=True) == 'Original Release':
            return f'/releasegroup/{m.group(1)}/'
    return None


def market_rows(soup):
    """[(market, release date, opening)] for every market row on a title or
    release-group page, Domestic included."""
    out = []
    for tr in soup.find_all('tr'):
        tds = tr.find_all('td')
        if len(tds) != 4 or not tds[0].find('a', href=re.compile(r'^/release/rl')):
            continue
        released = pd.to_datetime(tds[1].get_text(strip=True), format='%b %d, %Y', errors='coerce')
        out.append((tds[0].get_text(strip=True), released, _money(tds[2].get_text())))
    return out


def international_openings(markets, us_date, weeks=range(1, 9)):
    """International opening weekends known when US weekend k is reported:
    summed over markets that opened before that weekend's Friday. Overseas
    figures come in days late, so a market opening the same weekend as the
    US isn't counted yet (holdout: no less accurate than counting it)."""
    out = {}
    if pd.isna(us_date):
        return out
    intl = [(d, o) for name, d, o in markets if name != 'Domestic' and not pd.isna(d) and o]
    for k in weeks:
        cutoff = us_date + pd.Timedelta(days=7 * (k - 1) - 1)
        opened = [o for d, o in intl if d <= cutoff]
        out[f'intl_open_w{k}'] = sum(opened)
        out[f'intl_markets_w{k}'] = len(opened)
    return out


def original_release_totals(title):
    """(domestic, international, worldwide, number of release groups) for the
    original release, from the title page's by-release table. None when the
    title has a single release (the page totals are then that release's)."""
    for table in title.find_all('table'):
        if 'Release Group' not in table.get_text():
            continue
        df = pd.read_html(StringIO(str(table)))[0]
        orig = df[df['Release Group'] == 'Original Release']
        row = (orig if len(orig) else df).iloc[0]
        return (_money(row['Domestic']), _money(row['International']),
                _money(row['Worldwide']), len(df))
    return None


def summary_values(soup):
    """The 'Summary Details' block as {label: text}."""
    out = {}
    div = soup.find('div', class_=re.compile('mojo-summary-values'))
    if not div:
        return out
    for row in div.find_all('div', recursive=False):
        spans = row.find_all('span', recursive=False)
        if len(spans) >= 2:
            out[spans[0].get_text(strip=True)] = spans[1].get_text(' ', strip=True)
    return out


def performance_totals(soup):
    """(domestic, international, worldwide) from the performance summary.
    International is None when Mojo has no foreign figures."""
    div = soup.find('div', class_=re.compile('mojo-performance-summary-table'))
    vals = {}
    if div:
        for block in div.find_all('div', recursive=False):
            label = block.find('span', class_='a-size-small')
            money = block.find('span', class_='money')
            if label is not None:
                key = label.get_text(' ', strip=True).split('(')[0].strip().lower()
                vals[key] = _money(money.get_text()) if money else None
    return vals.get('domestic'), vals.get('international'), vals.get('worldwide')


def weekend_table(df):
    """Mojo's raw weekend table (pd.read_html) as clean numbers: week,
    weekend_gross, theaters, to_date (domestic gross to date, weekdays
    included), sorted by week."""
    out = pd.DataFrame({
        'week': pd.to_numeric(df.get('Weekend.1'), errors='coerce'),
        'weekend_gross': df['Weekend'].map(_money),
        'theaters': df['Theaters'].map(_int),
        'to_date': df['To Date'].map(_money),
        'dates': df['Date'],
    })
    return out.dropna(subset=['week', 'weekend_gross']).sort_values('week').reset_index(drop=True)


def film_facts(title, market_page, weeks):
    """Everything the model reads from Mojo for one film.

    `title`: the title page; `market_page`: the page listing its markets (the
    original release group's page for a title with re-releases, else the
    title page; None if unavailable); `weeks`: weekend_table() of the
    domestic release, or None."""
    summ = summary_values(title)
    row = {
        'distributor': (summ.get('Domestic Distributor') or '')
        .replace('See full company information', '').strip() or None,
        'mpaa': summ.get('MPAA'),
    }
    row['dom_all'], row['intl_all'], row['ww_all'] = performance_totals(title)
    orig = original_release_totals(title)
    if orig:
        row['dom_orig'], row['intl_orig'], row['ww_orig'], row['n_release_groups'] = orig
    else:
        row['dom_orig'], row['intl_orig'], row['ww_orig'] = row['dom_all'], row['intl_all'], row['ww_all']
        row['n_release_groups'] = 1

    markets = market_rows(market_page) if market_page is not None else []
    us = [d for name, d, _ in markets if name == 'Domestic']
    row['us_release'] = us[0] if us else pd.NaT
    row.update(international_openings(markets, row['us_release']))

    if weeks is not None and len(weeks):
        row['open_theaters'] = weeks['theaters'].iloc[0]
        row['widest_theaters'] = weeks['theaters'].max()
        row['weeks_in_release'] = int(weeks['week'].max())
        row['dom_release_total'] = weeks['to_date'].max()
    return row
