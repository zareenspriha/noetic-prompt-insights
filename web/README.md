# Prompt Insights frontend

Next.js 16 (App Router) + TypeScript + Tailwind v4 + TanStack Query + Recharts.

```bash
cd web
npm install
npm run dev        # http://localhost:3000
npm test           # Vitest + Testing Library, no browser or backend needed
```

Demo mode (sidebar toggle, ON by default) serves `/mocks/*.json`. Turn it off to hit the
FastAPI backend at `NEXT_PUBLIC_API_URL` (default `http://127.0.0.1:8001`; override in `.env.local`).
Start the backend from the repo root with `python -m prompt_insights serve`.

## Where things live

| Path | What |
|---|---|
| `types/api.ts` | Shared API contract with the backend. Change only in its own small PR. |
| `lib/api.ts` | One hook per route (`useWeeklyReport`, `useClassify`, `useReviewQueue`, `useFeedback`, `useUndoFeedback`, `useMetrics`, `useSources`). Pages use these, never `fetch` directly. Show errors with `errorMessage(error)`: it shows the backend's own message, or how to start the backend if it can't be reached. |
| `mocks/` | Fake seeded data matching `types/api.ts`. Numbers are placeholders, never pitch them. |
| `lib/tokens.ts`, `app/globals.css` | Topic + severity colors and the "redacted" theme (light, navy ink, Noetic blue accent; Newsreader + Public Sans, bundled so it works offline). |
| `components/shared/` | KpiTile, SeverityBadge, TopicBadge, ChartCard, EmptyState, Skeleton, PageHeader, `Masked` (draws `[NAME]`-style placeholders as redaction bars), SyntheticStamp. |
| `lib/challenge.ts` | Beat-the-detector rules: what counts as caught, scoring, exporting escapes as test cases. |
| `tests/` | Frontend tests. Components and pages run in jsdom with `fetch` mocked. |
| `components/report`, `classify`, `review`, `models` | Page-specific pieces. |

## Pages

| Route | Page | Backend |
|---|---|---|
| `/` | Weekly Report | `GET /report/weekly` |
| `/classify` | Classify Playground | `POST /classify` |
| `/review` | Review Queue | `GET /review`, `POST /feedback`, `POST /feedback/undo` |
| `/models` | Model Comparison | `GET /metrics` |
| `/about` | Data & Trust | `GET /sources` |
| `/challenge` | Beat the detector | `POST /classify` (kNN + rules only, never the LLM). Needs the live backend; disabled in demo mode. |

Without an LLM key, Classify's "Also ask the LLM" shows "No LLM is configured on the server", and the
Weekly Report's "LLM zero-shot" labels show how to run `label-events` once.

shadcn/ui is configured (`components.json`); add components with `npx shadcn@latest add button`.

## End-to-end tests (Playwright)

A real browser clicks through the real frontend against the real backend (Demo mode off).
First time only: `npx playwright install chromium`.

```bash
npm run test:e2e          # headless, prints pass/fail per test
npm run test:e2e:headed   # watch Chrome click through the pages
npm run test:e2e:ui       # Playwright's own window: step through each test, see every screen
npx playwright show-report
```

Already-running servers are reused (backend on 8001, frontend on 3000); otherwise Playwright
starts both (backend via `../.venv/bin/python`, override with `PI_PYTHON`). The suite never turns
on "Also ask the LLM", and fails if anything tries to, so it makes no paid calls. It checks:
every page opens; report KPIs match `/report/weekly`; small groups are hidden; the LLM zero-shot
view uses the saved results; planted secrets never appear; Model Comparison shows keyword, kNN
and LLM; a prompt that needs review lands at the top of the Review Queue, and a correction
removes it and Undo brings it back; Data & Trust counts match `/sources`; Demo mode labels its
numbers as placeholders.
