import { useRef, useState } from "react";
import { money, write } from "../api";
import type { Item, Product, Purchase } from "../types";
import { units } from "../types";
import { Field } from "./Shared";
export const newItem = (): Item => ({
  product_id: null,
  raw_name: "",
  quantity: "1",
  package_size: "1",
  unit: "Stück",
  line_total: "",
  discount: "0",
  deposit: "0",
  is_offer: false,
  is_return: false,
  attributes: {},
});

/** Shared controlled fields for manual purchases and import review. */
export function PurchaseEditor({
  value: editing,
  products,
  onChange,
  refresh,
  report,
}: {
  value: Purchase;
  products: Product[];
  onChange: (purchase: Purchase) => void;
  refresh: () => Promise<void>;
  report: (message: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [createdProducts, setCreatedProducts] = useState<Product[]>([]);
  const latest = useRef({ editing, onChange });
  latest.current = { editing, onChange };
  const availableProducts = [
    ...products,
    ...createdProducts.filter(
      (created) => !products.some(({ id }) => id === created.id),
    ),
  ];

  async function createProduct(index: number, item: Item) {
    const name = window
      .prompt("Name des neuen Produkts", item.raw_name)
      ?.trim();
    if (!name) return;
    setCreating(true);
    try {
      const product = await write<Product>("/products", {
        name,
        unit: item.unit,
      });
      setCreatedProducts((current) => [...current, product]);
      const { editing: current, onChange: apply } = latest.current;
      if (current.items[index] === item) {
        apply({
          ...current,
          items: current.items.map((position, i) =>
            i === index ? { ...position, product_id: product.id } : position,
          ),
        });
      }
      await refresh();
    } catch (error) {
      report(String(error));
    } finally {
      setCreating(false);
    }
  }

  const update = (key: keyof Purchase, value: unknown) =>
    onChange({ ...editing, [key]: value });
  const updateItem = (index: number, key: keyof Item, value: unknown) =>
    onChange({
      ...editing,
      items: editing.items.map((item, i) =>
        i === index ? { ...item, [key]: value } : item,
      ),
    });
  return (
    <>
      <div className="form-grid">
        {(
          [
            "purchased_at",
            "merchant",
            "branch",
            "city",
            "postal_code",
            "country",
          ] as const
        ).map((key, index) => (
          <Field
            key={key}
            label={
              [
                "Datum",
                "Händler",
                "Filiale",
                "Stadt",
                "Postleitzahl",
                "Land (ISO2)",
              ][index]
            }
          >
            <input
              required={["purchased_at", "merchant"].includes(key)}
              type={key === "purchased_at" ? "date" : "text"}
              value={editing[key]}
              onChange={(e) => update(key, e.target.value)}
            />
          </Field>
        ))}
        <Field label="Vertriebskanal">
          <select
            value={editing.channel}
            onChange={(e) => update("channel", e.target.value)}
          >
            <option value="store">Vor Ort</option>
            <option value="online">Online</option>
          </select>
        </Field>
        <Field label="Status">
          <select
            value={editing.status}
            onChange={(e) => update("status", e.target.value)}
          >
            <option value="draft">Entwurf</option>
            <option value="confirmed">Bestätigt</option>
          </select>
        </Field>
      </div>
      <p className="hint">
        Für bestätigte Einkäufe vor Ort sind Stadt und PLZ erforderlich.
        Dezimalwerte mit Punkt eingeben, z. B. 2.49.
      </p>
      {editing.items.map((item, index) => {
        const quantity = Number(item.quantity) * Number(item.package_size);
        const normalizedQuantity = ["g", "ml"].includes(item.unit)
          ? quantity / 1000
          : quantity;
        const preview =
          normalizedQuantity > 0
            ? (Number(item.line_total) - Number(item.discount)) /
              normalizedQuantity
            : null;
        return (
          <fieldset className="position" key={index}>
            <legend>Position {index + 1}</legend>
            <div className="form-grid">
              <Field label="Produktzuordnung">
                <select
                  value={item.product_id ?? ""}
                  disabled={creating}
                  onChange={(e) => {
                    const selected = e.target.value;
                    if (selected === "new") {
                      e.target.value = String(item.product_id ?? "");
                      void createProduct(index, item);
                    } else {
                      updateItem(
                        index,
                        "product_id",
                        selected ? Number(selected) : null,
                      );
                    }
                  }}
                >
                  <option value="">Unbekannt / nicht zugeordnet</option>
                  <option value="new">+ Neues Produkt anlegen …</option>
                  {availableProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Bezeichnung auf dem Bon">
                <input
                  required
                  value={item.raw_name}
                  onChange={(e) =>
                    updateItem(index, "raw_name", e.target.value)
                  }
                />
              </Field>
              {(["quantity", "package_size", "line_total"] as const).map(
                (key, i) => (
                  <Field
                    key={key}
                    label={
                      ["Packungszahl", "Inhalt je Packung", "Warenpreis €"][i]
                    }
                  >
                    <input
                      required={key !== "package_size"}
                      inputMode="decimal"
                      value={item[key] ?? ""}
                      onChange={(e) =>
                        updateItem(
                          index,
                          key,
                          e.target.value ||
                            (key === "package_size" ? null : ""),
                        )
                      }
                    />
                  </Field>
                ),
              )}
              <Field label="Einheit des Inhalts">
                <select
                  value={item.unit}
                  onChange={(e) => updateItem(index, "unit", e.target.value)}
                >
                  {units.map((unit) => (
                    <option key={unit}>{unit}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="inline">
              <button
                type="button"
                className="ghost danger"
                onClick={() =>
                  update(
                    "items",
                    editing.items.filter((_, i) => i !== index),
                  )
                }
              >
                Entfernen
              </button>
            </div>
            <p className="hint">
              Unverbindliche Vorschau:{" "}
              {preview === null
                ? "Menge ergänzen"
                : `${money(preview)} / ${item.unit === "g" ? "kg" : item.unit === "ml" ? "l" : item.unit}`}
              . Verbindlich rechnet der Server. Bei loser Ware: Packungszahl 1,
              Inhalt = Gesamtgewicht.
            </p>
          </fieldset>
        );
      })}
      <button
        type="button"
        className="ghost"
        onClick={() => update("items", [...editing.items, newItem()])}
      >
        + Position hinzufügen
      </button>
      <Field label="Notizen">
        <textarea
          value={editing.notes}
          onChange={(e) => update("notes", e.target.value)}
        />
      </Field>
    </>
  );
}
