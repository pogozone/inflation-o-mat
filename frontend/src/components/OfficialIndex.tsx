import { useEffect, useState } from "react";
import { api, decimal } from "../api";
import { monthNumber, splitContiguousMonths } from "../utils/priceSeries";
import { Empty } from "./Shared";
type OfficialSeries = {
  series: { period: string; index_value: string }[];
  source: string;
  base_year: string;
};
/** Independent contextual series: never mixed with personal item prices. */
export function OfficialIndex() {
  const [data, setData] = useState<OfficialSeries | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<OfficialSeries>("/official-index")
      .then(setData)
      .catch((error) => setError(String(error)));
  }, []);
  const series = [...(data?.series || [])].sort((a, b) =>
    a.period.localeCompare(b.period),
  );
  const values = series.map((row) => Number(row.index_value));
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const padding = Math.max((maximum - minimum) * 0.15, 1);
  const low = minimum - padding;
  const high = maximum + padding;
  const x = (index: number) =>
    65 +
    ((monthNumber(series[index].period) - monthNumber(series[0].period)) *
      610) /
      Math.max(
        monthNumber(series[series.length - 1].period) -
          monthNumber(series[0].period),
        1,
      );
  const y = (value: number) => 190 - ((value - low) / (high - low)) * 150;
  return (
    <section className="panel official-index">
      <div className="section-heading">
        <div>
          <span className="eyebrow">AMTLICHER KONTEXT · SEPARATE REIHE</span>
          <h2>Verbraucherpreisindex</h2>
        </div>
        {data?.base_year && (
          <span className="badge">Basis {data.base_year} = 100</span>
        )}
      </div>
      <p>
        Diese manuell hinterlegte amtliche Reihe beschreibt den allgemeinen
        Verbraucherpreisindex. Dein persönlicher Warenkorb und einzelne
        Produktpreise werden getrennt ausgewertet. Die Auswahlfilter oben
        verändern diese Referenzreihe nicht.
      </p>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : !data ? (
        <p role="status">Amtliche Reihe wird geladen …</p>
      ) : !series.length ? (
        <Empty>
          Hinterlege unter Import & Export eine amtliche Reihe mit Quelle und
          Basisjahr.
        </Empty>
      ) : (
        <>
          <svg
            viewBox="0 0 730 235"
            role="img"
            aria-label={`Amtlicher Verbraucherpreisindex, Basis ${data.base_year} gleich 100. Alle Werte stehen in der folgenden Tabelle.`}
          >
            {[0, 1, 2, 3].map((index) => {
              const value = low + ((high - low) * index) / 3;
              return (
                <g key={index}>
                  <line
                    x1="65"
                    x2="690"
                    y1={y(value)}
                    y2={y(value)}
                    stroke="#dddcd4"
                  />
                  <text x="4" y={y(value) + 4} fontSize="12" fill="#68726b">
                    {decimal(value)}
                  </text>
                </g>
              );
            })}
            {splitContiguousMonths(
              series.map((row) => ({ ...row, month: row.period })),
            ).map((segment, index) => (
              <polyline
                key={index}
                points={segment
                  .map(
                    (row) =>
                      `${x(series.findIndex((point) => point.period === row.period))},${y(Number(row.index_value))}`,
                  )
                  .join(" ")}
                fill="none"
                stroke="#123c37"
                strokeWidth="3"
              />
            ))}
            {series.map((row, index) => (
              <circle
                key={row.period}
                cx={x(index)}
                cy={y(Number(row.index_value))}
                r="3"
                fill="#123c37"
              />
            ))}
            <text x="65" y="220" fontSize="12" fill="#68726b">
              {series[0].period}
            </text>
            <text x="675" y="220" textAnchor="end" fontSize="12" fill="#68726b">
              {series[series.length - 1].period}
            </text>
          </svg>
          <p className="hint">
            Quelle: {data.source || "Keine Quelle angegeben"}. Basisjahr:{" "}
            {data.base_year}. Die Diagrammachse ist zur Lesbarkeit auf den
            Wertebereich begrenzt.
          </p>
          <details>
            <summary>Amtliche Indexwerte als Tabelle</summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Zeitraum</th>
                    <th>Indexwert</th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((row) => (
                    <tr key={row.period}>
                      <td>{row.period}</td>
                      <td>{decimal(row.index_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
