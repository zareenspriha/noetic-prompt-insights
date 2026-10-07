# Prompt Insights frontend

Next.js 16 (App Router) + TypeScript + Tailwind v4 + TanStack Query + Recharts.

```bash
cd web
npm install
npm run dev        # http://localhost:3000
```

Demo mode (sidebar toggle, ON by default) serves `/mocks/*.json`. Turn it off to hit the
FastAPI backend at `NEXT_PUBLIC_API_URL` (copy `.env.example` to `.env.local`).

## Where things live

| Path | What |
|---|---|
| `types/api.ts` | Shared API contract with the backend. Change only in its own small PR. |
| `lib/api.ts` | One hook per route (`useWeeklyReport`, `useClassify`, `useReviewQueue`, `useFeedback`, `useMetrics`, `useSources`). Pages use these, never `fetch` directly. |
| `mocks/` | Fake seeded data matching `types/api.ts`. Numbers are placeholders, never pitch them. |
| `lib/tokens.ts`, `app/globals.css` | Topic + severity colors, Noetic theme. |
| `components/shared/` | KpiTile, SeverityBadge, ChartCard, EmptyState, Skeleton, PageHeader. |

## Pages and owners

| Route | Page | Owner |
|---|---|---|
| `/` | Weekly Report | F1 |
| `/about` | Data & Trust | F1 |
| `/classify` | Classify Playground | F2 |
| `/review` | Review Queue | F2 |
| `/models` | Model Comparison | F2 |

shadcn/ui is configured (`components.json`); add components with `npx shadcn@latest add button`.
