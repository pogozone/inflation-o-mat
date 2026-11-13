import { useEffect, useState } from "react";
import { api, write } from "../api";
import type { Product, Purchase } from "../types";
import { Field, JsonEditor } from "../components/Shared";
import { PurchaseEditor } from "../components/PurchaseEditor";
type Preview = {
  purchases: Purchase[];
  warnings: string[];
  errors: string[];
  duplicate_ids?: number[];
  source_hash: string;
};
export function Transfer({
  refresh,
  report,
  products,
}: {
  products: Product[];
  refresh: () => Promise<void>;
  report: (message: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [mapping, setMapping] = useState("{}");
  const [delimiter, setDelimiter] = useState(";");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [edited, setEdited] = useState("[]");
  const [checked, setChecked] = useState(false);
  const [duplicates, setDuplicates] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [official, setOfficial] = useState("");
  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setImageUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function editPurchase(index: number, purchase: Purchase) {
    if (!preview) return;
    const purchases = preview.purchases.map((current, i) =>
      i === index ? purchase : current,
    );
    setPreview({ ...preview, purchases });
    setEdited(JSON.stringify(purchases, null, 2));
    setChecked(false);
  }
  useEffect(() => {
    api("/official-index")
      .then((result) => setOfficial(JSON.stringify(result, null, 2)))
      .catch((error) => report(String(error)));
  }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      report(String(error));
    } finally {
      setBusy(false);
    }
  }
  async function inspect(receipt = false) {
    if (!file) {
      report("Bitte zuerst eine Datei auswählen.");
      return;
    }
    let result: Preview;
    if (receipt) {
      const data = new FormData();
      data.append("file", file);
      data.append("consent", "true");
      result = await api<Preview>("/receipts/extract", {
        method: "POST",
        body: data,
      });
    } else {
      result = await write<Preview>("/import/preview", {
        format: file.name.toLowerCase().endsWith(".csv") ? "csv" : "json",
        content: await file.text(),
        delimiter,
        mapping: JSON.parse(mapping),
      });
    }
    setPreview(result);
    setEdited(JSON.stringify(result.purchases, null, 2));
    setChecked(false);
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Daten rein. Erkenntnisse raus.</h2>
          <p>Importe zuerst prüfen. Deine Daten bleiben exportierbar.</p>
        </div>
      </div>
      <div className="two-columns">
        <section className="panel">
          <span className="eyebrow">01 / IMPORT</span>
          <h3>CSV oder JSON einlesen</h3>
          <Field label="Datei auswählen">
            <input
              type="file"
              accept=".csv,.json,.jpg,.jpeg,.png,.webp"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setPreview(null);
              }}
            />
          </Field>
          <Field label="CSV-Trennzeichen">
            <input
              value={delimiter}
              onChange={(e) => setDelimiter(e.target.value)}
              maxLength={1}
            />
          </Field>
          <Field
            label={
              'CSV-Spaltenzuordnung (optional), z. B. {"merchant":"Geschäft"}'
            }
          >
            <textarea
              className="code"
              rows={3}
              value={mapping}
              onChange={(e) => setMapping(e.target.value)}
            />
          </Field>
          <p className="hint">
            Eine CSV-Zeile entspricht einer Position. Mehrere Einkäufe benötigen
            purchase_key. Ohne diesen Schlüssel wird alles als ein Einkauf zur
            Prüfung vorgelegt.
          </p>
          <button disabled={busy || !file} onClick={() => run(() => inspect())}>
            Importvorschau erstellen
          </button>
        </section>
        <section className="panel">
          <span className="eyebrow">02 / BONERKENNUNG</span>
          <h3>Beleg als Entwurf erfassen</h3>
          <p>
            Bilddatei oben auswählen (JPG, PNG, WebP). Die KI erkennt
            Positionen, kann aber Fehler machen. PDF wird noch nicht
            unterstützt.
          </p>
          <label className="consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              Ich stimme zu, dass dieses Belegbild zur Erkennung an OpenAI
              übermittelt wird. Ich prüfe den Entwurf vor dem Import.
            </span>
          </label>
          <button
            disabled={busy || !file || !consent}
            onClick={() => run(() => inspect(true))}
          >
            Beleg erkennen lassen
          </button>
          <p className="hint">
            Nur bei serverseitig eingerichtetem API-Schlüssel verfügbar. Es
            erfolgt keine automatische Übernahme.
          </p>
        </section>
      </div>
      {preview && (
        <section className="panel">
          <span className="eyebrow">PRÜFEN & KORRIGIEREN</span>
          <h3>{preview.purchases.length} Einkaufsentwürfe</h3>
          {preview.warnings.map((warning, i) => (
            <p className="warning" key={i}>
              {warning}
            </p>
          ))}
          {preview.errors.map((error, i) => (
            <p className="error" key={i}>
              {error}
            </p>
          ))}
          {!!preview.duplicate_ids?.length && (
            <p className="warning">
              Mögliche Duplikate: {preview.duplicate_ids.join(", ")}
            </p>
          )}
          <div className={imageUrl ? "receipt-review" : ""}>
            {imageUrl && (
              <aside className="receipt-image">
                <h3>Dein Originalbeleg</h3>
                <a href={imageUrl} target="_blank" rel="noreferrer">
                  <img
                    src={imageUrl}
                    alt="Ausgewählter Originalbeleg zur Prüfung der erkannten Positionen"
                  />
                </a>
                <p className="hint">
                  Bild anklicken, um es in Originalgröße zu prüfen.
                </p>
              </aside>
            )}
            <div>
              {preview.purchases.map((purchase, index) => (
                <details className="review-purchase" open key={index}>
                  <summary>
                    Einkauf {index + 1} ·{" "}
                    {purchase.merchant || "Händler ergänzen"} ·{" "}
                    {purchase.purchased_at || "Datum ergänzen"}
                  </summary>
                  <PurchaseEditor
                    value={purchase}
                    products={products}
                    onChange={(value) => editPurchase(index, value)}
                  />
                </details>
              ))}
            </div>
          </div>
          <details className="advanced-editor">
            <summary>Erweiterte Bearbeitung als JSON</summary>
            <JsonEditor
              value={edited}
              onChange={(value) => {
                setEdited(value);
                setChecked(false);
              }}
              label="Importdaten als JSON"
            />
            <button
              className="ghost"
              onClick={() => {
                try {
                  const purchases = JSON.parse(edited);
                  if (
                    !Array.isArray(purchases) ||
                    !purchases.every(
                      (purchase) => purchase && Array.isArray(purchase.items),
                    )
                  )
                    throw new Error(
                      "Ein Array von Einkäufen mit Positionen ist erforderlich.",
                    );
                  setPreview({ ...preview, purchases });
                  setChecked(false);
                  report(
                    "JSON-Änderungen in die Formulare übernommen. Bitte erneut prüfen.",
                  );
                } catch (error) {
                  report(String(error));
                }
              }}
            >
              JSON in Formulare übernehmen
            </button>
            <p className="hint">
              Übernommen werden die sichtbaren Formulardaten. Änderungen im JSON
              erst mit dieser Schaltfläche anwenden.
            </p>
          </details>
          <p className="hint">
            Nicht zugeordnete Produkte bleiben unbekannt. Standorte nicht
            schätzen. Unsichere Einkäufe als Entwurf übernehmen.
          </p>
          <label className="consent">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            Ich habe alle Einkäufe, Positionen, Standorte und Warnungen geprüft.
          </label>
          <label className="consent">
            <input
              type="checkbox"
              checked={duplicates}
              onChange={(e) => setDuplicates(e.target.checked)}
            />
            Duplikate ausdrücklich zulassen
          </label>
          <button
            disabled={busy || !checked}
            onClick={() =>
              run(async () => {
                const result = await write<{ created: number }>(
                  "/import/commit",
                  {
                    purchases: preview.purchases,
                    allow_duplicates: duplicates,
                  },
                );
                await refresh();
                setPreview(null);
                report(`${result.created} Einkäufe importiert.`);
              })
            }
          >
            Geprüfte Daten übernehmen
          </button>
        </section>
      )}
      <div className="two-columns">
        <section className="panel">
          <span className="eyebrow">03 / EXPORT</span>
          <h3>Deine Daten mitnehmen</h3>
          <p>
            JSON enthält Produkte, Einkäufe, Warenkörbe und die amtliche Reihe.
            CSV eignet sich zur weiteren Auswertung.
          </p>
          <div className="actions">
            <a className="button" href="/api/export/json" download>
              JSON exportieren ↓
            </a>
            <a className="button ghost" href="/api/export/csv" download>
              CSV exportieren ↓
            </a>
          </div>
          <hr />
          <h3>Sicherung wiederherstellen</h3>
          <p className="hint">
            Nur in eine leere Datenbank. Dein Benutzerkonto bleibt erhalten.
          </p>
          <Field label="Vollständiger JSON-Export">
            <input
              type="file"
              accept=".json"
              disabled={busy}
              onChange={(e) => {
                const restore = e.target.files?.[0];
                if (
                  restore &&
                  confirm(
                    "Diesen vollständigen Export in die leere Datenbank einspielen?",
                  )
                )
                  run(async () => {
                    const data = new FormData();
                    data.append("file", restore);
                    await api("/restore", { method: "POST", body: data });
                    await refresh();
                    report("Sicherung wiederhergestellt.");
                  });
                e.target.value = "";
              }}
            />
          </Field>
        </section>
        <section className="panel">
          <span className="eyebrow">OPTIONAL / AUSPROBIEREN</span>
          <h3>Mit Demodaten entdecken</h3>
          <p>
            Ein ausdrücklich markierter Beispieldatensatz zum Kennenlernen. Nur
            möglich, solange noch keine Einkäufe gespeichert sind.
          </p>
          <button
            className="ghost"
            disabled={busy}
            onClick={() => {
              if (
                confirm("Markierte Demodaten in die leere Kaufdatenbank laden?")
              )
                run(async () => {
                  await write("/demo", {});
                  await refresh();
                  report(
                    "Demodaten geladen. Diese Beispieldaten sind keine echten Preisbeobachtungen.",
                  );
                });
            }}
          >
            Demodaten laden
          </button>
        </section>
      </div>
      <section className="panel">
        <h3>Amtlicher Verbraucherpreisindex</h3>
        <p>
          Optional eine überprüfte amtliche Reihe mit Quelle und Basisjahr
          manuell hinterlegen. Es werden keine Werte automatisch ergänzt.
        </p>
        <JsonEditor
          value={official}
          onChange={setOfficial}
          label="Amtliche Reihe: series mit period/index_value, source und base_year"
        />
        <button
          disabled={busy || !official}
          onClick={() =>
            run(async () => {
              await write("/official-index", JSON.parse(official), "PUT");
              report("Amtliche Reihe gespeichert.");
            })
          }
        >
          Amtliche Reihe speichern
        </button>
      </section>
    </>
  );
}
