import { money, decimal } from "../api";
import type { Analytics, Observation } from "../types";
import { PriceChart } from "../components/PriceChart";
import { Empty } from "../components/Shared";
export function Overview({
  analytics,
  observations,
}: {
  analytics: Analytics | null;
  observations: Observation[];
}) {
  const summary = analytics?.summary;
  return (
    <>
      <div className="hero">
        <div>
          <span className="eyebrow">DEIN PERSÖNLICHES PREISGEDÄCHTNIS</span>
          <h2>Was kostet dein Alltag?</h2>
          <p>
            Beobachte echte Preise. Erkenne Veränderungen.
            <br />
            Mit deinen Einkäufen als Grundlage.
          </p>
        </div>
        <span className="hero-mark" aria-hidden="true">
          €<span>↗</span>
        </span>
      </div>
      <div className="stats">
        {[
          [
            "Warenwert im Zeitraum",
            money(summary?.total_spend),
            "Ausgewählte Positionen",
          ],
          [
            "Bestätigte Einkäufe",
            summary?.purchase_count ?? 0,
            "Im gewählten Zeitraum",
          ],
          [
            "Preisbeobachtungen",
            summary?.observation_count ?? 0,
            "Vergleichbare Kaufpositionen",
          ],
          ["Produkte", summary?.product_count ?? 0, "In deiner Auswahl"],
        ].map(([label, value, detail]) => (
          <div className="stat" key={String(label)}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">PREISENTWICKLUNG</span>
            <h2>Deine Preise im Zeitverlauf</h2>
          </div>
          <span className="badge">Monatlicher Median</span>
        </div>
        <PriceChart rows={analytics?.monthly || []} />
        <p className="hint">
          Jedes Produkt wird in seiner Vergleichseinheit getrennt ausgewertet.
          Preisänderungen sind persönliche Beobachtungen und keine allgemeine
          Inflationsrate.
        </p>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Preisbeobachtungen</h2>
          <span className="muted">{observations.length} Positionen</span>
        </div>
        {!observations.length ? (
          <Empty>
            Bestätige einen Einkauf, um deine ersten Beobachtungen zu sehen.
          </Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Produkt</th>
                  <th>Datum</th>
                  <th>Händler</th>
                  <th>Ort</th>
                  <th>Vergleichspreis</th>
                  <th>Warenbetrag</th>
                </tr>
              </thead>
              <tbody>
                {observations.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.product_name || "Nicht zugeordnet"}</strong>
                    </td>
                    <td>{row.purchased_at}</td>
                    <td>{row.merchant}</td>
                    <td>{row.city}</td>
                    <td>
                      {row.comparison_price === null
                        ? "Nicht vergleichbar"
                        : `${decimal(row.comparison_price)} € / ${row.comparison_unit}`}
                    </td>
                    <td>
                      {money(Number(row.line_total) - Number(row.discount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
