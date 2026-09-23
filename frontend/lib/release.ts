// US opening-weekend timing. Box Office Mojo posts a film's first-weekend
// gross the Monday after it opens, and predictions start from that figure,
// so until then a film is on screen but can't be priced yet.

/** Parse 'YYYY-MM-DD' as a local calendar date (not UTC midnight). */
export function parseDay(date: string | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** True from the US release until the end of the Monday after its first weekend. */
export function awaitingOpening(usReleaseDate: string | undefined, now: number): boolean {
  const opened = parseDay(usReleaseDate);
  if (!opened || opened.getTime() > now) return false;
  const toMonday = (8 - opened.getDay()) % 7 || 7; // Sunday → next day; Monday → a week on
  const mondayEnd = new Date(opened);
  mondayEnd.setDate(opened.getDate() + toMonday + 1);
  return now < mondayEnd.getTime();
}
