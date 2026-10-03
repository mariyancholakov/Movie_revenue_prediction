// A chart's figures as a table only a screen reader meets: the drawing says
// nothing to it, so the numbers it plots are here, one row per point.
export function ChartTable({ caption, heads, rows }: {
  caption: string;
  heads: string[];
  rows: (string | number)[][];
}) {
  return (
    <div className="sr-only">
    <table>
      <caption>{caption}</caption>
      <thead>
        <tr>{heads.map(h => <th key={h} scope="col">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => j === 0
              ? <th key={j} scope="row">{cell}</th>
              : <td key={j}>{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}
