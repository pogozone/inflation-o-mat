import { describe, expect, it } from "vitest";
import { groupPriceSeries, monthNumber } from "./priceSeries";
import type { MetricRow } from "../types";
function observation(
  productId: number | null,
  month: string,
  unit = "kg",
  name = "Milch",
): MetricRow {
  return {
    product_id: productId,
    product_name: name,
    month,
    comparison_unit: unit,
    median_price: "2.50",
    count: 1,
  };
}
describe("price series identity and incomplete coverage", () => {
  it("keeps identically named products separate while a renamed product retains its identity", () => {
    const groups = groupPriceSeries([
      observation(1, "2025-01"),
      observation(2, "2025-01"),
      observation(1, "2025-02", "kg", "Vollmilch"),
    ]);
    expect(groups).toHaveLength(2);
    expect(
      groups.find((group) => group.rows[0].product_id === 1)?.rows,
    ).toHaveLength(2);
    expect(groups.map((group) => group.label)).toEqual([
      "Milch · #1 / kg",
      "Milch · #2 / kg",
    ]);
  });
  it("separates incompatible units and uses name only when identity is absent", () => {
    const groups = groupPriceSeries([
      observation(1, "2025-01", "kg"),
      observation(1, "2025-01", "l"),
      observation(null, "2025-01", "kg"),
      observation(null, "2025-02", "kg"),
    ]);
    expect(groups).toHaveLength(3);
    expect(groups[2].rows).toHaveLength(2);
  });
  it("keeps merchant and branch histories separate without splitting aggregate observations", () => {
    const groups = groupPriceSeries([
      { ...observation(1, "2025-01"), merchant: "Markt A", branch: "Nord" },
      { ...observation(1, "2025-02"), merchant: "Markt A", branch: "Nord" },
      { ...observation(1, "2025-01"), merchant: "Markt A", branch: "Süd" },
      { ...observation(1, "2025-01"), merchant: "Markt B", branch: "Nord" },
      observation(1, "2025-01"),
    ]);
    expect(groups).toHaveLength(4);
    expect(groups[0].rows).toHaveLength(2);
    expect(groups[0].label).toContain("Markt A / Nord");
    expect(groups[3].label).not.toContain("Markt");
  });
  it("distinguishes identically named branches in different locations", () => {
    const row = {
      ...observation(1, "2025-01"),
      merchant: "Markt",
      branch: "Zentrum",
      country: "DE",
    };
    const groups = groupPriceSeries([
      { ...row, city: "Berlin", postal_code: "10115" },
      { ...row, city: "Hamburg", postal_code: "20095" },
      { ...row, city: "Berlin", postal_code: "10117" },
      { ...row, city: "Berlin", postal_code: "10115", country: "AT" },
    ]);
    expect(groups).toHaveLength(4);
    expect(groups[0].label).toContain("10115 Berlin DE");
    expect(groups[1].label).toContain("20095 Hamburg DE");
  });
  it("breaks gaps without filling prices and recognizes consecutive months across year boundaries", () => {
    const rows = [
      observation(1, "2026-03"),
      observation(1, "2025-12"),
      observation(1, "2026-01"),
    ];
    const [group] = groupPriceSeries(rows);
    expect(
      group.segments.map((segment) => segment.map((row) => row.month)),
    ).toEqual([["2025-12", "2026-01"], ["2026-03"]]);
    expect(monthNumber("2026-03") - monthNumber("2026-01")).toBe(2);
    expect(rows[0].month).toBe("2026-03");
  });
});
