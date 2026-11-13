import { marketLocationLabel } from "../utils/priceSeries";
import { decimal } from "../api";
import type { MetricRow } from "../types";

/** Each product/unit receives its own scale. Bars never compare unlike quantities. */
export function ComparisonBars({
  rows,
  kind,
}: {
  rows: MetricRow[];
  kind: "markets" | "regions";
}) {
  const groups = new Map<string, MetricRow[]>();
  for (const row of rows) {
    const key = JSON.stringify([row.product_id, row.comparison_unit]);
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return (
    <div className="comparison-bars">
      {[...groups].map(([key, values]) => {
        const sorted = [...values].sort(
          (a, b) => Number(a.median_price) - Number(b.median_price),
        );
        const maximum = Math.max(
          ...sorted.map((row) => Number(row.median_price)),
          0.01,
        );
        const product = sorted[0];
        return (
          <section className="bar-group" key={key}>
            <h3>
              {product.product_name} · #{product.product_id}{" "}
              <span>€ / {product.comparison_unit}</span>
            </h3>
            <p className="hint">
              Eigene Skala für dieses Produkt · 0 bis {decimal(maximum)} € /{" "}
              {product.comparison_unit}
            </p>
            {sorted.map((row, index) => {
              const label =
                kind === "markets"
                  ? `${row.merchant} / ${row.branch || "Filiale unbekannt"}${marketLocationLabel(row) ? ` · ${marketLocationLabel(row)}` : ""}`
                  : `${row.postal_code || ""} ${row.city || "Ort unbekannt"}`.trim();
              const description = `${label}: Median ${decimal(row.median_price)} Euro je ${row.comparison_unit}, ${row.count} Beobachtungen, zuletzt ${row.last_date || "unbekannt"}`;
              return (
                <div
                  className="bar-observation"
                  key={index}
                  role="img"
                  aria-label={description}
                >
                  <div className="bar-label" aria-hidden="true">
                    <strong>{label}</strong>
                    <span>
                      {decimal(row.median_price)} € / {row.comparison_unit}
                    </span>
                  </div>
                  <div className="bar-track" aria-hidden="true">
                    <div
                      style={{
                        width: `${Math.max((Number(row.median_price) / maximum) * 100, 0)}%`,
                      }}
                    />
                  </div>
                  <small aria-hidden="true">
                    {row.count} Beobachtungen · zuletzt{" "}
                    {row.last_date || "unbekannt"}
                    {kind === "regions"
                      ? ` · ${row.branch_count} Filialen`
                      : ""}
                  </small>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
