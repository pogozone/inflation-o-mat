import type { ReactNode } from "react";
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">↗</span>
      <h3>Noch keine Daten</h3>
      <p>{children}</p>
    </div>
  );
}
export function JsonEditor({
  value,
  onChange,
  label = "JSON bearbeiten",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <Field label={label}>
      <textarea
        className="code"
        rows={14}
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}
