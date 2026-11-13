import type { Filters as FilterValues, Product } from "../types";
import { Field } from "./Shared";
export function Filters({
  value,
  products,
  onChange,
}: {
  value: FilterValues;
  products: Product[];
  onChange: (value: FilterValues) => void;
}) {
  const update = (key: keyof FilterValues, content: string) =>
    onChange({ ...value, [key]: content });
  return (
    <details className="filter-panel" open>
      <summary>
        Auswahl verfeinern <span>Zeitraum · Produkt · Ort</span>
      </summary>
      <div className="filters">
        <Field label="Von">
          <input
            type="date"
            value={value.from}
            onChange={(e) => update("from", e.target.value)}
          />
        </Field>
        <Field label="Bis">
          <input
            type="date"
            value={value.to}
            onChange={(e) => update("to", e.target.value)}
          />
        </Field>
        <Field label="Produkt">
          <select
            value={value.product_id}
            onChange={(e) => update("product_id", e.target.value)}
          >
            <option value="">Alle Produkte</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        {(["city", "postal_code", "merchant", "category", "tag"] as const).map(
          (key, index) => (
            <Field
              key={key}
              label={
                ["Stadt", "Postleitzahl", "Händler", "Kategorie", "Tag"][index]
              }
            >
              <input
                value={value[key]}
                placeholder="Alle"
                onChange={(e) => update(key, e.target.value)}
              />
            </Field>
          ),
        )}
        <Field label="Angebote">
          <select
            value={value.include_offers}
            onChange={(e) => update("include_offers", e.target.value)}
          >
            <option value="true">Einbeziehen</option>
            <option value="false">Ausschließen</option>
          </select>
        </Field>
      </div>
    </details>
  );
}
