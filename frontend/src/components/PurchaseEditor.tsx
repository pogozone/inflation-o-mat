import { money } from "../api";
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
}: {
  value: Purchase;
  products: Product[];
  onChange: (purchase: Purchase) => void;
}) {
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
        <Field label="Bonsumme in € (optional)">
          <input
            inputMode="decimal"
            value={editing.receipt_total ?? ""}
            onChange={(e) => update("receipt_total", e.target.value || null)}
          />
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
                  onChange={(e) =>
                    updateItem(
                      index,
                      "product_id",
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                >
                  <option value="">Unbekannt / nicht zugeordnet</option>
                  {products.map((product) => (
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
              {(
                [
                  "quantity",
                  "package_size",
                  "line_total",
                  "discount",
                  "deposit",
                ] as const
              ).map((key, i) => (
                <Field
                  key={key}
                  label={
                    [
                      "Packungszahl",
                      "Inhalt je Packung",
                      "Warenpreis € vor Rabatt, ohne Pfand",
                      "Positionsrabatt €",
                      "Pfand €",
                    ][i]
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
                        e.target.value || (key === "package_size" ? null : ""),
                      )
                    }
                  />
                </Field>
              ))}
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
              <label>
                <input
                  type="checkbox"
                  checked={item.is_offer}
                  onChange={(e) =>
                    updateItem(index, "is_offer", e.target.checked)
                  }
                />{" "}
                Angebot
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={item.is_return}
                  onChange={(e) =>
                    updateItem(index, "is_return", e.target.checked)
                  }
                />{" "}
                Retoure
              </label>
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
