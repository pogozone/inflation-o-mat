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
  const [mergeSource, setMergeSource] = useState<Product | null>(null);
  const [mergeTarget, setMergeTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [ascending, setAscending] = useState(true);
  const [extraCategories, setExtraCategories] = useState<string[]>([]);
  const categories = [
    ...new Set([
      ...products.map((product) => product.category).filter(Boolean),
      ...extraCategories,
    ]),
  ].sort((a, b) => a.localeCompare(b, "de"));
  const sorted = [...products].sort(
    (a, b) => a.name.localeCompare(b.name, "de") * (ascending ? 1 : -1),
  );
  function open(product: Partial<Product>) {
    setEditing(product);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      await write(
        editing.id ? `/products/${editing.id}` : "/products",
        // Marke und Merkmale bleiben für Bestandsdaten unverändert erhalten.
        { brand: "", attributes: {}, ...editing },
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
        `„${mergeSource.name}“ mit „${target.name}“ zusammenführen? Die Historie bleibt erhalten.`,
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
              category: "",
              unit: "Stück",
              tags: [],
              aliases: [],
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
                    {product.name} · #{product.id}
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
            <Field label="Name">
              <input
                required
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </Field>
            <Field label="Kategorie">
              <select
                value={editing.category || ""}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "new") {
                    e.target.value = editing.category || "";
                    const created = window
                      .prompt("Name der neuen Kategorie")
                      ?.trim();
                    if (!created) return;
                    if (!categories.includes(created))
                      setExtraCategories((current) => [...current, created]);
                    setEditing({ ...editing, category: created });
                  } else {
                    setEditing({ ...editing, category: value });
                  }
                }}
              >
                <option value="">Keine Kategorie</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
                <option value="new">+ Neue Kategorie anlegen …</option>
              </select>
            </Field>
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
          <p className="hint">
            Bon-Aliasse sind Schreibweisen, wie das Produkt auf dem Kassenzettel
            steht (z. B. „TR.MILCH 3,5 1L“). Bei der Bonerkennung werden so
            bereits bekannte Bon-Texte exakt diesem Produkt zugeordnet.
          </p>
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
                  <th aria-sort={ascending ? "ascending" : "descending"}>
                    <button
                      className="text-button"
                      onClick={() => setAscending((value) => !value)}
                    >
                      Produkt {ascending ? "↑" : "↓"}
                    </button>
                  </th>
                  <th>Kategorie</th>
                  <th>Tags</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <strong>{product.name}</strong>
                      <small>
                        #{product.id} · {product.unit}
                      </small>
                    </td>
                    <td>{product.category || "–"}</td>
                    <td>{product.tags.join(", ")}</td>
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
