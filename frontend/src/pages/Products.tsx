import { useState } from "react";
import { write } from "../api";
import { units, type Product } from "../types";
import { Empty, Field } from "../components/Shared";
export function Products({
  products,
  refresh,
  report,
}: {
  products: Product[];
  refresh: () => Promise<void>;
  report: (message: string) => void;
}) {
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [attributes, setAttributes] = useState("{}");
  const [mergeSource, setMergeSource] = useState<Product | null>(null);
  const [mergeTarget, setMergeTarget] = useState("");
  const [busy, setBusy] = useState(false);
  function open(product: Partial<Product>) {
    setEditing(product);
    setAttributes(JSON.stringify(product.attributes || {}, null, 2));
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      await write(
        editing.id ? `/products/${editing.id}` : "/products",
        { ...editing, attributes: JSON.parse(attributes) },
        editing.id ? "PUT" : "POST",
      );
      await refresh();
      setEditing(null);
      report("Produkt gespeichert.");
    } catch (error) {
      report(String(error));
    } finally {
      setBusy(false);
    }
  }
  async function merge(event: React.FormEvent) {
    event.preventDefault();
    const target = products.find(
      (product) => product.id === Number(mergeTarget),
    );
    if (
      !mergeSource ||
      !target ||
      !confirm(
        `„${mergeSource.name}“ (${mergeSource.brand || "ohne Marke"}) mit „${target.name}“ (${target.brand || "ohne Marke"}) zusammenführen? Die Historie bleibt erhalten.`,
      )
    )
      return;
    setBusy(true);
    try {
      await write(`/products/${mergeSource.id}/merge`, {
        target_id: target.id,
      });
      await refresh();
      setMergeSource(null);
      report("Produkte zusammengeführt. Rückgängig ist weiterhin möglich.");
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
          <h2>Produkte & Merkmale</h2>
          <p>Ein Name. Viele Bons. Saubere Vergleiche.</p>
        </div>
        <button
          onClick={() =>
            open({
              name: "",
              brand: "",
              category: "",
              unit: "Stück",
              tags: [],
              aliases: [],
              attributes: {},
            })
          }
        >
          + Produkt anlegen
        </button>
      </div>
      {mergeSource && (
        <form className="panel" onSubmit={merge}>
          <h3>„{mergeSource.name}“ zusammenführen</h3>
          <p>
            Wähle das bestehende Zielprodukt. Kaufhistorie und Herkunft bleiben
            erhalten.
          </p>
          <Field label="Zielprodukt">
            <select
              required
              value={mergeTarget}
              onChange={(e) => setMergeTarget(e.target.value)}
            >
              <option value="">Produkt auswählen</option>
              {products
                .filter(
                  (product) =>
                    product.id !== mergeSource.id && !product.merged_into_id,
                )
                .map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} · {product.brand || "ohne Marke"} · #
                    {product.id}
                  </option>
                ))}
            </select>
          </Field>
          <div className="actions">
            <button disabled={busy || !mergeTarget}>
              Zusammenführung bestätigen
            </button>
            <button
              className="ghost"
              type="button"
              onClick={() => setMergeSource(null)}
            >
              Abbrechen
            </button>
          </div>
        </form>
      )}
      {editing && (
        <form className="panel editor" onSubmit={save}>
          <h2>{editing.id ? "Produkt bearbeiten" : "Neues Produkt"}</h2>
          <div className="form-grid">
            {(["name", "brand", "category"] as const).map((key, index) => (
              <Field key={key} label={["Name", "Marke", "Kategorie"][index]}>
                <input
                  required={key === "name"}
                  value={editing[key]}
                  onChange={(e) =>
                    setEditing({ ...editing, [key]: e.target.value })
                  }
                />
              </Field>
            ))}
            <Field label="Einheit">
              <select
                value={editing.unit}
                onChange={(e) =>
                  setEditing({ ...editing, unit: e.target.value })
                }
              >
                {units.map((unit) => (
                  <option key={unit}>{unit}</option>
                ))}
              </select>
            </Field>
            {(["tags", "aliases"] as const).map((key) => (
              <Field
                key={key}
                label={
                  key === "tags"
                    ? "Tags (kommagetrennt)"
                    : "Bon-Aliasse (kommagetrennt)"
                }
              >
                <input
                  value={editing[key]?.join(", ")}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      [key]: e.target.value
                        .split(",")
                        .map((value) => value.trim()),
                    })
                  }
                />
              </Field>
            ))}
          </div>
          <Field
            label={
              'Flexible Merkmale als JSON, z. B. {"bio": true, "Fettgehalt": "3,5 %"}'
            }
          >
            <textarea
              className="code"
              rows={5}
              value={attributes}
              onChange={(e) => setAttributes(e.target.value)}
            />
          </Field>
          <div className="actions">
            <button disabled={busy}>
              {busy ? "Speichert …" : "Produkt speichern"}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => setEditing(null)}
            >
              Abbrechen
            </button>
          </div>
        </form>
      )}
      <div className="panel">
        {!products.length ? (
          <Empty>
            Lege Produkte an und verknüpfe sie mit deinen Kaufpositionen.
          </Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Produkt</th>
                  <th>Marke</th>
                  <th>Kategorie</th>
                  <th>Merkmale & Tags</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <strong>{product.name}</strong>
                      <small>
                        #{product.id} · {product.unit}
                      </small>
                    </td>
                    <td>{product.brand || "–"}</td>
                    <td>{product.category || "–"}</td>
                    <td>
                      {product.tags.join(", ")}
                      <small>
                        {Object.entries(product.attributes)
                          .map(([key, value]) => `${key}: ${String(value)}`)
                          .join(" · ")}
                      </small>
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => open(product)}
                      >
                        Bearbeiten
                      </button>
                      <button
                        className="text-button"
                        disabled={!!product.merged_into_id}
                        onClick={() => {
                          setMergeSource(product);
                          setMergeTarget("");
                        }}
                      >
                        Zusammenführen
                      </button>
                      {product.merged_into_id && (
                        <button
                          className="text-button"
                          onClick={async () => {
                            try {
                              await write(
                                `/products/${product.id}/undo-merge`,
                                {},
                              );
                              await refresh();
                              report("Zusammenführung aufgehoben.");
                            } catch (error) {
                              report(String(error));
                            }
                          }}
                        >
                          Zusammenführung rückgängig
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
