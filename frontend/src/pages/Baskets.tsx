import { useEffect, useRef, useState } from "react";
import { api, decimal, money, write } from "../api";
import type { Basket, Product } from "../types";
import { units } from "../types";
import { Empty, Field } from "../components/Shared";
type Comparison = {
  complete: boolean;
  index: string | null;
  change_percent: string | null;
  base_cost: string | null;
  current_cost: string | null;
  coverage_percent: string;
  missing: string[];
  items: unknown[];
};
export function Baskets({
  baskets,
  products,
  refresh,
  report,
}: {
  baskets: Basket[];
  products: Product[];
  refresh: () => Promise<void>;
  report: (message: string) => void;
}) {
  const [name, setName] = useState("Mein Alltagskorb");
  const [items, setItems] = useState([
    { product_id: products[0]?.id || 0, quantity: "1", unit: "kg" },
  ]);
  const [dates, setDates] = useState({
    base_from: "",
    base_to: "",
    current_from: "",
    current_to: "",
  });
  const [results, setResults] = useState<Record<number, Comparison>>({});
  const requestVersion = useRef(0);
  useEffect(() => {
    requestVersion.current += 1;
    setResults({});
  }, [baskets]);
  function changeDate(key: keyof typeof dates, value: string) {
    requestVersion.current += 1;
    setResults({});
    setDates((current) => ({ ...current, [key]: value }));
  }
  useEffect(
    () => () => {
      requestVersion.current += 1;
    },
    [],
  );
  const [busy, setBusy] = useState(false);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await write("/baskets", { name, items });
      await refresh();
      report("Warenkorb angelegt.");
    } catch (error) {
      report(String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Dein persönlicher Warenkorb</h2>
          <p>Gleiche Mengen. Zwei Zeiträume. Dein Preisvergleich.</p>
        </div>
      </div>
      <form className="panel" onSubmit={create}>
        <h3>Warenkorb anlegen</h3>
        <Field label="Name">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        {items.map((item, index) => (
          <div className="basket-row" key={index}>
            <Field label="Produkt">
              <select
                required
                value={item.product_id || ""}
                onChange={(e) => {
                  const assigned = products.find(
                    (product) => product.id === Number(e.target.value),
                  );
                  setItems(
                    items.map((row, i) =>
                      i === index
                        ? {
                            ...row,
                            product_id: Number(e.target.value),
                            unit: assigned?.unit ?? row.unit,
                          }
                        : row,
                    ),
                  );
                }}
              >
                <option value="" disabled>
                  Auswählen
                </option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Feste Menge">
              <input
                required
                value={item.quantity}
                onChange={(e) =>
                  setItems(
                    items.map((row, i) =>
                      i === index ? { ...row, quantity: e.target.value } : row,
                    ),
                  )
                }
              />
            </Field>
            <Field label="Einheit">
              <select
                value={item.unit}
                onChange={(e) =>
                  setItems(
                    items.map((row, i) =>
                      i === index ? { ...row, unit: e.target.value } : row,
                    ),
                  )
                }
              >
                {units.map((unit) => (
                  <option key={unit}>{unit}</option>
                ))}
              </select>
            </Field>
            <button
              type="button"
              className="ghost"
              onClick={() => setItems(items.filter((_, i) => i !== index))}
            >
              Entfernen
            </button>
          </div>
        ))}
        <div className="actions">
          <button
            type="button"
            className="ghost"
            onClick={() =>
              setItems([
                ...items,
                { product_id: products[0]?.id || 0, quantity: "1", unit: "kg" },
              ])
            }
          >
            + Produkt
          </button>
          <button disabled={busy || !items.length || !products.length}>
            Warenkorb speichern
          </button>
        </div>
      </form>
      <section className="panel">
        <h3>Vergleichszeiträume</h3>
        <div className="form-grid">
          {(Object.keys(dates) as (keyof typeof dates)[]).map((key, i) => (
            <Field
              key={key}
              label={
                ["Basis von", "Basis bis", "Aktuell von", "Aktuell bis"][i]
              }
            >
              <input
                required
                type="date"
                value={dates[key]}
                onChange={(e) => changeDate(key, e.target.value)}
              />
            </Field>
          ))}
        </div>
        <p className="hint">
          Ein Index wird nur bei vollständiger Abdeckung gebildet. Fehlende
          Preise werden nicht fortgeschrieben.
        </p>
      </section>
      {!baskets.length && (
        <div className="panel">
          <Empty>
            Definiere einen festen Warenkorb für deinen persönlichen Index.
          </Empty>
        </div>
      )}
      {baskets.map((basket) => (
        <section className="panel" key={basket.id}>
          <div className="section-heading">
            <div>
              <h3>{basket.name}</h3>
              <p>{basket.items.length} Produkte · feste Mengen</p>
            </div>
            <div className="actions">
              <button
                disabled={!Object.values(dates).every(Boolean) || busy}
                onClick={async () => {
                  const version = ++requestVersion.current;
                  setResults({});
                  setBusy(true);
                  try {
                    const result = await write<Comparison>(
                      `/baskets/${basket.id}/compare`,
                      dates,
                    );
                    if (version === requestVersion.current)
                      setResults({ [basket.id]: result });
                  } catch (error) {
                    report(String(error));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Zeiträume vergleichen
              </button>
              <button
                className="ghost danger"
                onClick={async () => {
                  if (!confirm("Warenkorb löschen?")) return;
                  try {
                    await api(`/baskets/${basket.id}`, { method: "DELETE" });
                    await refresh();
                  } catch (error) {
                    report(String(error));
                  }
                }}
              >
                Löschen
              </button>
            </div>
          </div>
          {results[basket.id] && (
            <div className="comparison-result">
              <strong>
                {results[basket.id].complete
                  ? `${decimal(results[basket.id].change_percent)} %`
                  : "Vergleich unvollständig"}
              </strong>
              <p>
                Abdeckung: {decimal(results[basket.id].coverage_percent)} % ·
                Index: {decimal(results[basket.id].index)}
              </p>
              <p>
                Basis:{" "}
                {results[basket.id].base_cost === null
                  ? "–"
                  : money(results[basket.id].base_cost)}{" "}
                · Aktuell:{" "}
                {results[basket.id].current_cost === null
                  ? "–"
                  : money(results[basket.id].current_cost)}
              </p>
              {results[basket.id].missing.length > 0 && (
                <p>Fehlend: {results[basket.id].missing.join(", ")}</p>
              )}
              <details>
                <summary>Berechnungspositionen</summary>
                <pre>{JSON.stringify(results[basket.id].items, null, 2)}</pre>
              </details>
            </div>
          )}
        </section>
      ))}
    </>
  );
}
