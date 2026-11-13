import { decimal } from "../api";
import type { MetricRow } from "../types";
import { groupPriceSeries, monthNumber } from "../utils/priceSeries";
import { Empty } from "./Shared";
export function PriceChart({ rows }: { rows: MetricRow[] }) {
  if (!rows.length)
    return (
      <Empty>
        Bestätigte Einkäufe mit vergleichbaren Mengen machen Preisverläufe
        sichtbar.
      </Empty>
    );
  const groups = groupPriceSeries(rows);
  return (
    <div className="chart-grid">
      {groups.map(({ key, label: name, rows: sorted, segments }) => {
        const max =
          Math.max(...sorted.map((row) => Number(row.median_price)), 0.01) *
          1.15;
        const firstMonth = monthNumber(sorted[0].month);
        const lastMonth = monthNumber(sorted[sorted.length - 1].month);
        const point = (row: MetricRow) =>
          `${55 + ((monthNumber(row.month) - firstMonth) * 620) / Math.max(lastMonth - firstMonth, 1)},${190 - (Number(row.median_price) / max) * 155}`;
        const points = sorted.map(point);
        return (
          <div key={key}>
            <h3>{name}</h3>
            <svg
              viewBox="0 0 730 230"
              role="img"
              aria-label={`Monatlicher Medianpreis: ${name}. Werte in der folgenden Tabelle.`}
            >
              {[0, 1, 2, 3].map((i) => (
                <g key={i}>
                  <line
                    x1="55"
                    x2="690"
                    y1={190 - i * 50}
                    y2={190 - i * 50}
                    stroke="#dddcd4"
                  />
                  <text x="2" y={194 - i * 50} fontSize="12" fill="#68726b">
                    {decimal((max * i * 50) / 155)}
                  </text>
                </g>
              ))}
              {segments.map((segment, index) => (
                <polyline
                  key={index}
                  points={segment.map(point).join(" ")}
                  fill="none"
                  stroke="#df713f"
                  strokeWidth="3"
                />
              ))}
              {points.map((point, i) => (
                <g key={i}>
                  <circle
                    cx={point.split(",")[0]}
                    cy={point.split(",")[1]}
                    r="5"
                    fill="#123c37"
                  />
                  <text
                    x={point.split(",")[0]}
                    y="217"
                    textAnchor="middle"
                    fontSize="12"
                    fill="#68726b"
                  >
                    {String(sorted[i].month)}
                  </text>
                </g>
              ))}
            </svg>
            <p className="hint">
              Lücken ohne Monatsbeobachtung werden nicht verbunden. Punkte
              zeigen ausschließlich vorhandene Daten.
            </p>
            <details>
              <summary>Werte als Tabelle anzeigen</summary>
              <table>
                <thead>
                  <tr>
                    <th>Monat</th>
                    <th>Median €/Einheit</th>
                    <th>Beobachtungen</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row, i) => (
                    <tr key={i}>
                      <td>{row.month}</td>
                      <td>{decimal(row.median_price)}</td>
                      <td>{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>
        );
      })}
    </div>
  );
}
