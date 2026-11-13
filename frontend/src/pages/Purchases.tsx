import { useState } from "react";
import { api, ApiError, money, write } from "../api";
import type { Product, Purchase } from "../types";
import { newItem, PurchaseEditor } from "../components/PurchaseEditor";
import { Empty } from "../components/Shared";
const newPurchase = (): Purchase => ({
  purchased_at: new Date().toISOString().slice(0, 10),
  merchant: "",
  branch: "",
  city: "",
  postal_code: "",
  country: "DE",
  channel: "store",
  currency: "EUR",
  status: "draft",
  receipt_total: null,
  notes: "",
  items: [newItem()],
});
export function Purchases({
  purchases,
  products,
  refresh,
  report,
}: {
  purchases: Purchase[];
  products: Product[];
  refresh: () => Promise<void>;
  report: (message: string) => void;
}) {
  const [editing, setEditing] = useState<Purchase | null>(null);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [duplicateConflict, setDuplicateConflict] = useState(false);
  function openPurchase(purchase: Purchase) {
    setEditing(purchase);
    setAllowDuplicate(false);
    setDuplicateConflict(false);
  }
  const [busy, setBusy] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      await write(
        editing.id ? `/purchases/${editing.id}` : "/purchases",
        { ...editing, ...(allowDuplicate ? { allow_duplicate: true } : {}) },
        editing.id ? "PUT" : "POST",
      );
      await refresh();
      setEditing(null);
      report("Einkauf gespeichert.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409)
        setDuplicateConflict(true);
      report(String(error));
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: number) {
    if (!confirm("Diesen Einkauf mit allen Positionen löschen?")) return;
    try {
      await api(`/purchases/${id}`, { method: "DELETE" });
      await refresh();
      report("Einkauf gelöscht.");
    } catch (error) {
      report(String(error));
    }
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Deine Einkäufe</h2>
          <p>Jeder Bon ein Stück Preisgeschichte.</p>
        </div>
        <button onClick={() => openPurchase(newPurchase())}>
          + Einkauf erfassen
        </button>
      </div>
      {editing && (
        <form className="panel editor" onSubmit={save}>
          <div className="section-heading">
            <h2>{editing.id ? "Einkauf bearbeiten" : "Neuer Einkauf"}</h2>
            <button
              type="button"
              className="ghost"
              onClick={() => setEditing(null)}
            >
              Schließen ×
            </button>
          </div>
          <PurchaseEditor
            value={editing}
            products={products}
            onChange={setEditing}
          />
          {duplicateConflict && (
            <div className="warning" role="alert">
              <p>
                Ein möglicher doppelter Einkauf wurde erkannt. Prüfe deine
                gespeicherten Einkäufe. Wenn dies ein eigener, zusätzlicher
                Vorgang ist, kannst du ihn ausdrücklich trotzdem speichern.
              </p>
              <label className="consent">
                <input
                  type="checkbox"
                  checked={allowDuplicate}
                  onChange={(e) => setAllowDuplicate(e.target.checked)}
                />
                Diesen Einkauf ausdrücklich als zusätzlichen Vorgang speichern
              </label>
            </div>
          )}
          <div className="actions">
            <button disabled={busy || !editing.items.length}>
              {busy ? "Speichert …" : "Einkauf speichern"}
            </button>
          </div>
        </form>
      )}
      <div className="panel">
        {!purchases.length ? (
          <Empty>
            Erfasse deinen ersten Einkauf oder importiere vorhandene Daten.
          </Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Händler / Ort</th>
                  <th>Positionen</th>
                  <th>Waren + Pfand</th>
                  <th>Status</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((purchase) => (
                  <tr key={purchase.id}>
                    <td>{purchase.purchased_at}</td>
                    <td>
                      <strong>{purchase.merchant}</strong>
                      <small>
                        {purchase.city} {purchase.branch}
                      </small>
                      {purchase.notes?.includes("DEMO") && (
                        <span className="badge">Demo</span>
                      )}
                    </td>
                    <td>{purchase.items.length}</td>
                    <td>
                      {money(
                        purchase.items.reduce(
                          (sum, item) =>
                            sum +
                            (Number(item.line_total) -
                              Number(item.discount) +
                              Number(item.deposit)) *
                              (item.is_return ? -1 : 1),
                          0,
                        ),
                      )}
                    </td>
                    <td>
                      <span
                        className={`badge ${purchase.status === "confirmed" ? "green" : ""}`}
                      >
                        {purchase.status === "confirmed"
                          ? "Bestätigt"
                          : "Entwurf"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => openPurchase(structuredClone(purchase))}
                      >
                        Bearbeiten
                      </button>
                      <button
                        className="text-button danger"
                        onClick={() => remove(purchase.id!)}
                      >
                        Löschen
                      </button>
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
