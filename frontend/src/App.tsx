import { useCallback, useEffect, useState } from "react";
import { api, setCsrf, write } from "./api";
import type {
  Analytics,
  Basket,
  Filters as FilterValues,
  Observation,
  Product,
  Purchase,
  Session,
} from "./types";
import { Field } from "./components/Shared";
import { Filters } from "./components/Filters";
import { Overview } from "./pages/Overview";
import { Purchases } from "./pages/Purchases";
import { Products } from "./pages/Products";
import { Comparisons } from "./pages/Comparisons";
import { Baskets } from "./pages/Baskets";
import { Transfer } from "./pages/Transfer";
const navigation = [
  ["overview", "◈", "Übersicht"],
  ["purchases", "▤", "Einkäufe"],
  ["products", "▦", "Produkte"],
  ["comparisons", "↗", "Vergleiche"],
  ["baskets", "◷", "Warenkorb"],
  ["transfer", "⇄", "Import & Export"],
];
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [recoveringSession, setRecoveringSession] = useState(false);
  const [page, setPage] = useState("overview");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [baskets, setBaskets] = useState<Basket[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [filters, setFilters] = useState<FilterValues>({
    from: "",
    to: "",
    city: "",
    postal_code: "",
    merchant: "",
    product_id: "",
    category: "",
    tag: "",
    include_offers: "true",
  });
  const acceptSession = (value: Session) => {
    setCsrf(value.csrf_token);
    setSession(value);
  };
  useEffect(() => {
    api<Session>("/session")
      .then(acceptSession)
      .catch((error) => setMessage(String(error)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const recover = () => {
      setRecoveringSession(true);
      setMessage(
        "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an. Deine offenen Eingaben bleiben erhalten; speichere sie danach erneut.",
      );
      api<Session>("/session")
        .then((value) => setCsrf(value.csrf_token))
        .catch(() => {});
    };
    window.addEventListener("session-expired", recover);
    return () => window.removeEventListener("session-expired", recover);
  }, []);
  const refresh = useCallback(async () => {
    const [nextProducts, nextPurchases, nextBaskets] = await Promise.all([
      api<Product[]>("/products"),
      api<Purchase[]>("/purchases"),
      api<Basket[]>("/baskets"),
    ]);
    setProducts(nextProducts);
    setPurchases(nextPurchases);
    setBaskets(nextBaskets);
  }, []);
  useEffect(() => {
    if (session?.authenticated)
      refresh().catch((error) => setMessage(String(error)));
  }, [session?.authenticated, refresh]);
  // Both endpoints receive the identical filter query; stale results are discarded.
  useEffect(() => {
    if (!session?.authenticated) return;
    let active = true;
    const query = new URLSearchParams(
      Object.entries(filters).filter(([, value]) => value !== ""),
    ).toString();
    setLoading(true);
    setAnalytics(null);
    setObservations([]);
    Promise.all([
      api<Analytics>(`/analytics?${query}`),
      api<Observation[]>(`/observations?${query}`),
    ])
      .then(([nextAnalytics, nextObservations]) => {
        if (active) {
          setAnalytics(nextAnalytics);
          setObservations(nextObservations);
        }
      })
      .catch((error) => {
        if (active) setMessage(String(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session?.authenticated, filters, purchases, products]);
  async function authenticate(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      acceptSession(
        await write<Session>(session?.setup_required ? "/setup" : "/login", {
          username,
          password,
        }),
      );
      setPassword("");
      setRecoveringSession(false);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setLoading(false);
    }
  }
  const loginView = (
    <main className="login-shell">
      <div className="login-brand">
        <span className="brand-symbol">
          i<span>↗</span>
        </span>
        <h1>
          Inflation-o-mat<span>Dein Preisgedächtnis.</span>
        </h1>
        <p>
          Ein klarer Blick auf das,
          <br />
          was dein Alltag kostet.
        </p>
      </div>
      <form className="login-card" onSubmit={authenticate}>
        <span className="eyebrow">WILLKOMMEN</span>
        <h2>
          {session?.setup_required
            ? "Dein Preisgedächtnis beginnt hier."
            : "Schön, dass du da bist."}
        </h2>
        <p>
          {session?.setup_required
            ? "Lege dein Konto an. Deine Einkäufe werden sicher auf deinem Server gespeichert."
            : "Melde dich an, um deine Einkäufe und Preisverläufe zu sehen."}
        </p>
        {message && (
          <div className="notice" role="alert">
            {message}
          </div>
        )}
        <Field label="Benutzername">
          <input
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>
        <Field
          label={
            session?.setup_required
              ? "Passwort (mindestens 12 Zeichen)"
              : "Passwort"
          }
        >
          <input
            type="password"
            autoComplete={
              session?.setup_required ? "new-password" : "current-password"
            }
            minLength={session?.setup_required ? 12 : undefined}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <button disabled={loading || !session}>
          {loading
            ? "Bitte warten …"
            : session?.setup_required
              ? "Konto einrichten →"
              : "Anmelden →"}
        </button>
        {!session && !loading && (
          <button
            type="button"
            className="ghost"
            onClick={() => location.reload()}
          >
            Verbindung erneut versuchen
          </button>
        )}
      </form>
    </main>
  );
  if (!session?.authenticated) return loginView;
  const title = navigation.find((row) => row[0] === page)?.[2];
  return (
    <>
      <div className="app-shell" inert={recoveringSession}>
        <a href="#main" className="skip-link">
          Zum Inhalt
        </a>
        <aside className="sidebar">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setPage("overview");
            }}
          >
            <span className="brand-symbol">
              i<span>↗</span>
            </span>
            <span>
              Inflation-o-mat<small>DEIN PREISGEDÄCHTNIS</small>
            </span>
          </a>
          <div className="nav-label">DEIN ÜBERBLICK</div>
          <nav aria-label="Hauptnavigation">
            {navigation.map(([key, icon, label]) => (
              <button
                key={key}
                className={page === key ? "active" : ""}
                aria-current={page === key ? "page" : undefined}
                onClick={() => setPage(key)}
              >
                <span aria-hidden="true">{icon}</span>
                {label}
                {page === key && <i />}
              </button>
            ))}
          </nav>
          <div className="sidebar-note">
            <span>
              Aus kleinen Beobachtungen
              <br />
              wird ein großes Bild.
            </span>
            <p>Deine Daten. Deine Perspektive.</p>
          </div>
          <div className="account">
            <span className="avatar">
              {session.username?.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{session.username}</strong>
              <button
                onClick={async () => {
                  try {
                    acceptSession(await write<Session>("/logout", {}));
                    setProducts([]);
                    setPurchases([]);
                    setBaskets([]);
                    setAnalytics(null);
                  } catch (error) {
                    setMessage(String(error));
                  }
                }}
              >
                Abmelden
              </button>
            </div>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <span>
              MEIN PREISGEDÄCHTNIS <span className="breadcrumb">/ {title}</span>
            </span>
            <span className="private-badge">
              <i /> Privat & persönlich
            </span>
          </header>
          <main id="main">
            <div className="page-heading">
              <div>
                <span className="eyebrow">
                  INFLATION VERSTEHEN. BEWUSSTER EINKAUFEN.
                </span>
                <h1>
                  {title}
                  <span>.</span>
                </h1>
              </div>
              <span className="today">
                {new Intl.DateTimeFormat("de-DE", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                }).format(new Date())}
              </span>
            </div>
            {message && (
              <div className="notice" role="alert">
                <span>{message}</span>
                <button
                  className="text-button"
                  onClick={() => setMessage("")}
                  aria-label="Meldung schließen"
                >
                  ×
                </button>
              </div>
            )}
            {purchases.some((purchase) => /demo/i.test(purchase.notes)) && (
              <p className="warning">
                Demodaten aktiv · Diese Beispieldaten stellen keine echten
                Einkäufe dar.
              </p>
            )}
            {["overview", "comparisons"].includes(page) && (
              <Filters
                value={filters}
                products={products}
                onChange={setFilters}
              />
            )}
            {loading && (
              <p className="loading" role="status">
                Daten werden geladen …
              </p>
            )}
            {page === "overview" && (
              <Overview analytics={analytics} observations={observations} />
            )}
            {page === "purchases" && (
              <Purchases
                purchases={purchases}
                products={products}
                refresh={refresh}
                report={setMessage}
              />
            )}
            {page === "products" && (
              <Products
                products={products}
                refresh={refresh}
                report={setMessage}
              />
            )}
            {page === "comparisons" && <Comparisons analytics={analytics} />}
            {page === "baskets" && (
              <Baskets
                baskets={baskets}
                products={products}
                refresh={refresh}
                report={setMessage}
              />
            )}
            {page === "transfer" && (
              <Transfer
                products={products}
                refresh={refresh}
                report={setMessage}
              />
            )}
            <footer>
              Inflation-o-mat{" "}
              <span>
                Ein persönlicher Blick auf Preise. Kein amtlicher
                Inflationsindex.
              </span>
            </footer>
          </main>
        </div>
      </div>
      {recoveringSession && (
        <div
          className="auth-recovery"
          role="dialog"
          aria-modal="true"
          aria-label="Erneut anmelden"
        >
          {loginView}
        </div>
      )}
    </>
  );
}
