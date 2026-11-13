> Historische Review-Befunde. Die bestätigten wichtigen Probleme wurden nach dieser Review behoben. Aktueller Prüfstand: VERIFICATION.md und Tests.

# Frontend source review

Read-only implementation review against `docs/API-CONTRACT.md` and the current backend. No browser verification was available. Backend tests and frontend build were reported passing by the coordinating agent; this review does not independently assert runtime coverage.

## Prioritized findings

1. **P1: Charts merge distinct products with the same display name.** `frontend/src/components/PriceChart.tsx:15` groups by `product_name` and unit, although the API deliberately includes `product_id`. Create two products named “Milch” with different brands, buy both in the same month, and open Übersicht or Zeitverlauf: separate monthly medians become one connected series, potentially with two points for the same month. Use product ID plus unit as the group key and distinguish names in the legend.

2. **P2: Manual purchase workflow cannot confirm legitimate duplicates.** `frontend/src/pages/Purchases.tsx:38` sends the purchase without an explicit duplicate confirmation path; `frontend/src/api.ts:21` also discards structured conflict details/status. Enter a legitimate second matching purchase, or import two identical purchases with duplicates explicitly allowed and then edit only notes on either: the backend returns 409 and the manual editor offers no way to approve and retry. Expose explicit confirmation after a duplicate conflict and send `allow_duplicate: true` only following that confirmation.

3. **P2: Basket results silently survive changes to comparison dates.** `frontend/src/pages/Baskets.tsx:165` updates dates without invalidating results; results rendered at line 225 contain no associated dates. Compare two periods, change a date, and the old index still appears below the newly selected dates. A failed subsequent comparison preserves it too. Clear results on date changes or store/display the requested dates with each result and mark stale results.

4. **P2: Session expiration or another-tab token rotation has no recovery path.** `frontend/src/api.ts:21` turns every failure into a plain Error; `frontend/src/App.tsx:51` obtains session state only on mount. Log out/in in another tab or let the session expire, then save in the original tab: it remains authenticated locally and repeatedly sends a stale CSRF token. Refresh session state on authentication/CSRF failure, preserve unsaved editor data, and surface the login/retry action. Initial setup/login/logout token replacement itself is correctly implemented through `acceptSession`.

5. **P2: Failed filter requests leave old results under new filters.** `frontend/src/App.tsx:93` sets an error but does not clear or mark analytics/observations stale. Load one selection, change the filter while the server/database is unavailable, and the prior selection remains displayed under the changed filter controls. Invalidate results on filter changes or retain a visible last-successful-selection label. The active-effect guard does correctly prevent an older successful request from overwriting a newer request.

## Checked workflows without a source-level blocker

- Purchase editing clones the fetched purchase and preserves item IDs/extra runtime fields. Create versus update uses POST versus PUT correctly.
- Filter queries are shared between observations and analytics; successful stale requests are ignored.
- Price units are separated, with accessible value tables; the product identity grouping defect above remains.
- Import form edits update both visible purchases and the JSON text. JSON changes require a clearly labelled explicit apply button; commit submits the visible form state. Review confirmation resets after edits.
- The official-index component requests the backend, handles empty data honestly, and draws a separate index with source/base year and a value table. No fabricated official data is supplied.
- Export links use authenticated same-origin GETs and match backend attachment routes. Session-expired download errors are not handled in the app, but successful download wiring matches the contract.

No application source files were changed during this review.
