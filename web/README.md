# Prompt Insights frontend

Next.js 16 (App Router) + TypeScript + Tailwind v4 + TanStack Query + Recharts.

```bash
cd web
npm install
npm run dev        # http://localhost:3000
```

Demo mode (sidebar toggle, ON by default) serves `/mocks/*.json`. Turn it off to hit the
FastAPI backend at `NEXT_PUBLIC_API_URL` (default `http://127.0.0.1:8001`; override in `.env.local`).
Start the backend from the repo root with `python -m prompt_insights serve`.

## Where things live

| Path | What |
|---|---|
| `types/api.ts` | Shared API contract with the backend. Change only in its own small PR. |
| `lib/api.ts` | One hook per route (`useWeeklyReport`, `useClassify`, `useReviewQueue`, `useFeedback`, `useUndoFeedback`, `useMetrics`, `useSources`). Pages use these, never `fetch` directly. Show errors with `errorMessage(error)`: it explains 501 (needs an LLM key) and an unreachable backend. |
| `mocks/` | Fake seeded data matching `types/api.ts`. Numbers are placeholders, never pitch them. |
| `lib/tokens.ts`, `app/globals.css` | Topic + severity colors, Noetic theme. |
| `components/shared/` | KpiTile, SeverityBadge, TopicBadge, ChartCard, EmptyState, Skeleton, PageHeader. |
| `components/report`, `classify`, `review`, `models` | Page-specific pieces. |

## Pages

| Route | Page | Backend |
|---|---|---|
| `/` | Weekly Report | `GET /report/weekly` |
| `/classify` | Classify Playground | `POST /classify` |
| `/review` | Review Queue | `GET /review`, `POST /feedback`, `POST /feedback/undo` |
| `/models` | Model Comparison | `GET /metrics` |
| `/about` | Data & Trust | `GET /sources` |

The LLM option (Weekly Report "Labels from", Classify "Also ask the LLM") returns a clear
"needs an LLM API key" message until the backend has one.

shadcn/ui is configured (`components.json`); add components with `npx shadcn@latest add button`.
