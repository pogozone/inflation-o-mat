import { useState } from "react";
import { marketLocationLabel } from "../utils/priceSeries";
import { decimal } from "../api";
import type { Analytics, MetricRow } from "../types";
import { ComparisonBars } from "../components/ComparisonBars";
import { Empty, Field } from "../components/Shared";
import { OfficialIndex } from "../components/OfficialIndex";
import { PriceChart } from "../components/PriceChart";
export function Comparisons({ analytics }: { analytics: Analytics | null }) {
  const [timeGrouping, setTimeGrouping] = useState("markets");
  const [tab, setTab] = useState("markets");
  const rows: MetricRow[] =
    tab === "regions"
      ? analytics?.regions || []
      : tab === "changes"
        ? analytics?.changes || []
        : analytics?.markets || [];
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Preise in Perspektive</h2>
          <p>Gleiche Produkte und Einheiten. Nachvollziehbare Unterschiede.</p>
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Vergleichsart">
        {[
          ["markets", "Händler"],
          ["regions", "Regionen"],
          ["time", "Zeitverlauf"],
          ["changes", "Veränderungen"],
        ].map(([key, label]) => (
          <button
            role="tab"
            aria-selected={tab === key}
            key={key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="panel">
        {tab === "time" ? (
          <>
            <Field label="Zeitverlauf aufschlüsseln">
              <select
                value={timeGrouping}
                onChange={(event) => setTimeGrouping(event.target.value)}
              >
                <option value="markets">Nach Händler/Filiale</option>
                <option value="all">Alle Händler zusammen</option>
              </select>
            </Field>
            <p className="hint">
              {timeGrouping === "markets"
                ? "Jede Filiale bleibt als eigene Produkt- und Einheitenreihe sichtbar. Darunter stehen alle Monatswerte als Tabelle."
                : "Monatsmediane je Produkt und Einheit über alle ausgewählten Händler."}
            </p>
            <PriceChart
              rows={
                (timeGrouping === "markets"
                  ? analytics?.market_monthly
                  : analytics?.monthly) || []
              }
            />
          </>
        ) : !rows.length ? (
          <Empty>
            Für diese Auswahl liegen noch keine Vergleichswerte vor.
          </Empty>
        ) : (
          <>
            {(tab === "markets" || tab === "regions") && (
              <ComparisonBars rows={rows} kind={tab} />
            )}
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Produkt</th>
                    <th>
                      {tab === "regions"
                        ? "Region"
                        : tab === "changes"
                          ? "Erster → letzter Preis"
                          : "Händler / Filiale"}
                    </th>
                    <th>{tab === "changes" ? "Veränderung" : "Medianpreis"}</th>
                    <th>Beobachtungen</th>
                    {tab === "regions" && <th>Filialen</th>}
                    <th>Letzte Beobachtung</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={index}>
                      <td>
                        <strong>{row.product_name}</strong>
                        <small>€ / {row.comparison_unit}</small>
                      </td>
                      <td>
                        {tab === "regions"
                          ? `${row.postal_code} ${row.city}`
                          : tab === "changes"
                            ? `${decimal(row.first_price)} → ${decimal(row.last_price)} €`
                            : `${row.merchant} · ${row.branch || "–"}${marketLocationLabel(row) ? ` · ${marketLocationLabel(row)}` : ""}`}
                      </td>
                      <td>
                        {tab === "changes"
                          ? `${decimal(row.change_percent)} %`
                          : `${decimal(row.median_price)} €`}
                      </td>
                      <td>{row.count}</td>
                      {tab === "regions" && <td>{row.branch_count}</td>}
                      <td>{row.last_date || "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <p className="hint">
          Mediane beziehen sich ausschließlich auf vorhandene Daten. Marken,
          Merkmale, Mengen und Filialabdeckung vor Schlussfolgerungen prüfen.
        </p>
      </div>
      <OfficialIndex />
    </>
  );
}
