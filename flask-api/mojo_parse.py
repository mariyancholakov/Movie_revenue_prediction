"""Parsers for Box Office Mojo pages, shared by the live API (app.py) and the
seed backfill (scripts/scrape_mojo.py) so a film priced live is read exactly
like the films the model learned from. Everything takes a parsed page
(BeautifulSoup) and never fetches.
"""
import re
from io import StringIO

import numpy as np
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


def domestic_daily_path(title):
    """The original domestic release's day-by-day page."""
    path = domestic_release_path(title)
    return path.replace('/weekend/', '/') if path else None


def opening_week_shape(daily_page):
    """How the opening week played day by day, from the domestic release's
    daily page (domestic_daily_path): the call settles midweek, when
    Monday's and Tuesday's grosses are in. A film that holds up on the
    weekdays is spreading by word of mouth; a Friday swollen by previews means
    fans came early. {} until Tuesday is reported, or for a page without
    daily figures (most films before 2000).
      dy_fri_share     Friday / opening weekend
      dy_sat_fri       log(Saturday / Friday)
      dy_mon_sun       log(Monday / Sunday)
      dy_montue_wknd   log((Monday + Tuesday) / opening weekend)
    On the holdout the opening call's MAE fell 5-8% with these."""
    table = daily_page.find('table') if daily_page is not None else None
    if table is None:
        return {}
    df = pd.read_html(StringIO(str(table)))[0]
    if 'Daily' not in df or 'DOW' not in df:
        return {}
    first = {}
    for dow, gross in zip(df['DOW'].head(12), df['Daily'].head(12)):
        first.setdefault(dow, _money(str(gross)))
    days = [first.get(d) for d in ('Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday')]
    if not all(days):
        return {}
    fri, sat, sun, mon, tue = days
    weekend = fri + sat + sun
    return {'dy_fri_share': fri / weekend, 'dy_sat_fri': float(np.log(sat / fri)),
            'dy_mon_sun': float(np.log(mon / sun)), 'dy_montue_wknd': float(np.log((mon + tue) / weekend))}


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


# The overseas markets whose gross to date the model reads: about two thirds
# of all overseas box office. Mojo names (market rows) -> area codes (charts).
INTL_TD_MARKETS = {
    'United Kingdom': 'GB', 'China': 'CN', 'France': 'FR', 'Germany': 'DE', 'Japan': 'JP',
    'Australia': 'AU', 'Mexico': 'MX', 'Spain': 'ES', 'South Korea': 'KR', 'Italy': 'IT',
    'Brazil': 'BR', 'Netherlands': 'NL',
}


def market_releases(soup):
    """{market: (release id, release date)} for the INTL_TD_MARKETS on a title
    or release-group page."""
    out = {}
    for tr in soup.find_all('tr'):
        tds = tr.find_all('td')
        a = tds[0].find('a', href=re.compile(r'^/release/rl')) if len(tds) == 4 else None
        name = tds[0].get_text(strip=True) if a else None
        if name in INTL_TD_MARKETS and name not in out:
            released = pd.to_datetime(tds[1].get_text(strip=True), format='%b %d, %Y', errors='coerce')
            out[name] = (re.match(r'/release/(rl\d+)', a['href']).group(1), released)
    return out


def _sunday(day):
    return day + pd.Timedelta(days=(6 - day.weekday()) % 7)


def release_to_date(weeks, released):
    """[(Sunday, gross to date)] for one market's release, from its weekend
    table (weekend_table() of /release/<rl>/weekend/), each weekend dated
    from the market's release date."""
    if weeks is None or pd.isna(released):
        return []
    first = _sunday(released)
    return [(first + pd.Timedelta(days=7 * (int(w) - 1)), float(t))
            for w, t in zip(weeks['week'], weeks['to_date']) if not pd.isna(t)]


def chart_to_date(chart_soup, sunday):
    """[(release id, Sunday, gross to date)] from one market's weekend chart
    (/weekend/<year>W<week>/?area=..)."""
    table = chart_soup.find('table') if chart_soup is not None else None
    if table is None:
        return []
    head = [th.get_text(strip=True) for th in table.find_all('tr')[0].find_all('th')]
    if 'Total Gross' not in head:
        return []
    col = head.index('Total Gross')
    out = []
    for tr in table.find_all('tr')[1:]:
        tds, a = tr.find_all('td'), tr.find('a', href=re.compile(r'^/release/rl'))
        if a and len(tds) > col and _money(tds[col].get_text()) is not None:
            out.append((re.match(r'/release/(rl\d+)', a['href']).group(1), sunday, float(_money(tds[col].get_text()))))
    return out


def international_to_date(series, us_date, weeks=range(1, MAX_STAGE + 1)):
    """Overseas gross to date in the INTL_TD_MARKETS, as known by the call made
    after US weekend k: each market's latest gross to date from weekends up to
    that US weekend's Sunday, summed. `series`: {market: [(Sunday, to date)]}.
    Charts for the weekend just played come in during the week, so like the
    international openings this settles midweek. On the holdout the forecast
    after weekend 8 went 11.8% -> 8.9% median miss (MAE $30M -> $23M),
    weekend 4 14.2% -> 13.3%, and the opening call 25.0% -> 24.2%."""
    out = {}
    if pd.isna(us_date):
        return out
    opening_sunday = _sunday(us_date)
    for k in weeks:
        cutoff = opening_sunday + pd.Timedelta(days=7 * (k - 1))
        total = 0.0
        for points in series.values():
            seen = [t for s, t in sorted(points) if s <= cutoff]
            total += seen[-1] if seen else 0.0
        out[f'intl_td_w{k}'] = total
    return out


def international_openings(markets, us_date, weeks=range(1, MAX_STAGE + 1)):
    """International opening weekends known by the call made after US weekend
    k: summed over markets that opened by that weekend's Sunday. Overseas
    figures come in a few days after the weekend, so the call settles
    midweek; counting the markets that open alongside the US weekend made the
    opening call more accurate (holdout median miss 26.4% -> 25.2%)."""
    out = {}
    if pd.isna(us_date):
        return out
    intl = [(d, o) for name, d, o in markets if name != 'Domestic' and not pd.isna(d) and o]
    opening_sunday = us_date + pd.Timedelta(days=(6 - us_date.weekday()) % 7)
    for k in weeks:
        cutoff = opening_sunday + pd.Timedelta(days=7 * (k - 1))
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


def weekend_frame(soup):
    """The raw weekend table (pd.read_html) on a /release/<rl>/weekend/ page,
    or None. Not just the first table: a market release too new for a
    weekend has only a rankings table there."""
    for table in soup.find_all('table') if soup is not None else []:
        head = [th.get_text(strip=True) for th in table.find_all('th')]
        if 'To Date' in head and head.count('Weekend') >= 2:
            return pd.read_html(StringIO(str(table)))[0]
    return None


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
