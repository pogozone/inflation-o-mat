import type { MetricRow } from "../types";

export function monthNumber(month: unknown): number {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month));
  return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : NaN;
}

export function marketLocationLabel(row: MetricRow): string {
  return [row.postal_code, row.city, row.country].filter(Boolean).join(" ");
}

/** Identity is the product ID, never its mutable or non-unique display name. */
export function groupPriceSeries(rows: MetricRow[]) {
  const groups = new Map<string, MetricRow[]>();
  for (const row of rows) {
    const identity =
      row.product_id != null
        ? ["id", row.product_id]
        : ["name", row.product_name];
    const marketIdentity =
      row.merchant !== undefined || row.branch !== undefined
        ? [
            "market",
            row.merchant ?? "",
            row.branch ?? "",
            row.country ?? "",
            row.city ?? "",
            row.postal_code ?? "",
          ]
        : [];
    const key = JSON.stringify([
      ...identity,
      row.comparison_unit,
      ...marketIdentity,
    ]);
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups].map(([key, values]) => {
    const sorted = [...values].sort((a, b) =>
      String(a.month).localeCompare(String(b.month)),
    );
    const first = sorted[0];
    const label = `${first.product_name}${first.product_id != null ? ` · #${first.product_id}` : ""} / ${first.comparison_unit}`;
    const marketLabel =
      first.merchant !== undefined || first.branch !== undefined
        ? ` · ${first.merchant || "Händler unbekannt"} / ${first.branch || "Filiale unbekannt"}${marketLocationLabel(first) ? ` · ${marketLocationLabel(first)}` : ""}`
        : "";
    return {
      key,
      label: label + marketLabel,
      rows: sorted,
      segments: splitContiguousMonths(sorted),
    };
  });
}

/** A missing month breaks the line; it never implies an observed/interpolated price. */
export function splitContiguousMonths(rows: MetricRow[]): MetricRow[][] {
  const segments: MetricRow[][] = [];
  for (const row of rows) {
    const segment = segments[segments.length - 1];
    if (
      !segment ||
      monthNumber(row.month) -
        monthNumber(segment[segment.length - 1].month) !==
        1
    )
      segments.push([row]);
    else segment.push(row);
  }
  return segments;
}
