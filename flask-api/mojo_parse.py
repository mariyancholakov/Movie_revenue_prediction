"""Parsers for Box Office Mojo pages, shared by the live API (app.py) and the
seed backfill (scripts/scrape_mojo.py) so a film priced live is read exactly
like the films the model learned from. Everything takes a parsed page
(BeautifulSoup) and never fetches.
"""
import re
from io import StringIO

import pandas as pd

from model_lib import MAX_STAGE


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


def international_openings(markets, us_date, weeks=range(1, MAX_STAGE + 1)):
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


_MONTHS = {m: i for i, m in enumerate(
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], 1)}
_DATES = re.compile(r'^([A-Z][a-z]{2}) (\d{1,2})(?:-(?:([A-Z][a-z]{2}) )?(\d{1,2}))?')


def _span(text):
    """(start, end) of a weekend-table date cell such as 'Nov 26-28',
    'Nov 27-Dec 1Thanksgiving 5-Day' or 'Dec 31-Jan 2, 2011', as dates in a
    fixed leap year (the cells rarely carry a year). None if unreadable."""
    m = _DATES.match(str(text))
    if not m or m.group(1) not in _MONTHS or (m.group(3) and m.group(3) not in _MONTHS):
        return None
    start_m, start_d = _MONTHS[m.group(1)], int(m.group(2))
    end_m = _MONTHS[m.group(3)] if m.group(3) else start_m
    end_d = int(m.group(4) or start_d)
    try:
        start, end = pd.Timestamp(2000, start_m, start_d), pd.Timestamp(2000, end_m, end_d)
    except ValueError:
        return None
    if end < start:  # crosses New Year
        end += pd.DateOffset(years=1)
    return start, end


def weekend_numbers(dates):
    """Each row's weekend number, counted from the first row by its end date.

    Mojo's own number goes wrong around holidays: Thanksgiving is listed as
    5-Day, 4-Day and 3-Day rows that all repeat the previous weekend's number
    (Harry Potter and the Deathly Hallows: Part 1's Thanksgiving is numbered
    1, and its next weekend 3), so that film's real weekend 2 would be lost.
    Every variant of a weekend ends on the same Sunday, so the date gives the
    true number. Rows are in date order; a step back in the calendar is a new
    year. None for an unreadable row."""
    out, prev, days = [], None, 0
    for text in dates:
        span = _span(text)
        if span is None:
            out.append(None)
            continue
        end = span[1]
        if prev is not None:
            step = (end - prev).days
            days += step if step >= 0 else step + 366
        prev = end
        # Rounded: the fixed leap year can be a day off across a February.
        out.append(int(round(days / 7)) + 1)
    return out


def weekend_table(df):
    """Mojo's raw weekend table (pd.read_html) as clean numbers: week,
    weekend_gross, theaters, to_date (domestic gross to date, weekdays
    included), sorted by week, one row per weekend. The table has two
    "Weekend" headers: pandas names the gross column 'Weekend' and the
    weekend-number column 'Weekend.1'.

    Holiday long weekends are listed several times ("Thanksgiving 5-Day",
    "4-Day", "3-Day"); weekends are numbered by date (weekend_numbers) and
    the shortest span of each, the Friday-Sunday one every other weekend is
    measured over, is kept. Rows before the first one Mojo numbers are sneak
    previews (Aquaman's, a week before it opened) and are dropped: the opening
    weekend is weekend 1."""
    numbered = pd.to_numeric(df.get('Weekend.1'), errors='coerce').notna().values
    df = df.iloc[numbered.argmax():] if numbered.any() else df.iloc[:0]
    numbers = weekend_numbers(df['Date'])
    spans = [_span(t) for t in df['Date']]
    out = pd.DataFrame({
        'week': pd.to_numeric(pd.Series(numbers, index=df.index, dtype=object), errors='coerce'),
        'weekend_gross': df['Weekend'].map(_money),
        'theaters': df['Theaters'].map(_int),
        'to_date': df['To Date'].map(_money),
        'dates': df['Date'],
        'span_days': [(s[1] - s[0]).days if s else 99 for s in spans],
    })
    return out.dropna(subset=['week', 'weekend_gross']).sort_values(['week', 'span_days'], kind='stable') \
        .drop_duplicates('week').drop(columns='span_days').reset_index(drop=True)


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
