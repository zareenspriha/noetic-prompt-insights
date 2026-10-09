"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useDemoMode } from "@/lib/demo-mode";
import type {
  ClassifyRequest,
  ClassifyResponse,
  Correction,
  FeedbackResponse,
  Metrics,
  ReviewItem,
  Sources,
  WeeklyReport,
} from "@/types/api";

import weeklyMock from "@/mocks/report-weekly.json";
import classifyMock from "@/mocks/classify.json";
import reviewMock from "@/mocks/review.json";
import metricsMock from "@/mocks/metrics.json";
import sourcesMock from "@/mocks/sources.json";

/** FastAPI base URL. Set NEXT_PUBLIC_API_URL in web/.env.local (default: local uvicorn). */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8001";

/** A response the backend sent on purpose (4xx/5xx), with FastAPI's `detail` message. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new Error(
      `Can't reach the backend at ${API_URL}. Start it with "python -m prompt_insights serve", or turn on Demo mode.`,
    );
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = typeof body?.detail === "string" ? body.detail : `request failed (${res.status})`;
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

/** Human-readable error for EmptyState/toasts. 501 = feature needs setup (e.g. an LLM key). */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 501)
    return `${error.message}. It needs an LLM API key on the backend; kNN works without one.`;
  return error instanceof Error ? error.message : String(error);
}

/** Fake latency so loading skeletons are visible in demo mode. */
const mock = <T,>(data: unknown, ms = 300) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(structuredClone(data) as T), ms));

export type ReportFilters = { week?: string; team?: string; topic?: string; model?: string };

function qs(params: Record<string, string | undefined>) {
  const s = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => !!e[1]),
  ).toString();
  return s ? `?${s}` : "";
}

// ---------------- hooks (one per route in types/api.ts) ----------------

export function useWeeklyReport(filters: ReportFilters = {}) {
  const { demo } = useDemoMode();
  return useQuery({
    queryKey: ["report", demo, filters],
    queryFn: () =>
      demo ? mock<WeeklyReport>(weeklyMock) : http<WeeklyReport>(`/report/weekly${qs(filters)}`),
  });
}

export function useClassify() {
  const { demo } = useDemoMode();
  return useMutation({
    mutationFn: (body: ClassifyRequest) =>
      demo
        ? mock<ClassifyResponse>(
            { ...classifyMock, llm: body.allowLlm ? classifyMock.llm : null, agree: body.allowLlm ? classifyMock.agree : null },
            600,
          )
        : http<ClassifyResponse>("/classify", { method: "POST", body: JSON.stringify(body) }),
  });
}

/** Cache key for GET /review, shared so pages can update the queue (and the sidebar badge) in place. */
export const reviewQueueKey = (demo: boolean) => ["review", demo] as const;

export function useReviewQueue() {
  const { demo } = useDemoMode();
  return useQuery({
    queryKey: reviewQueueKey(demo),
    queryFn: () => (demo ? mock<ReviewItem[]>(reviewMock) : http<ReviewItem[]>("/review")),
  });
}

let demoCorrections = 0;
export function useFeedback() {
  const { demo } = useDemoMode();
  return useMutation({
    mutationFn: (c: Correction) =>
      demo
        ? mock<FeedbackResponse>({
            ok: true,
            indexSize: 210 + ++demoCorrections,
            correctionsTotal: demoCorrections,
            undoToken: `demo-${demoCorrections}`,
          })
        : http<FeedbackResponse>("/feedback", { method: "POST", body: JSON.stringify(c) }),
  });
}

/** POST /feedback/undo: reverts one correction using the token /feedback returned. */
export function useUndoFeedback() {
  const { demo } = useDemoMode();
  return useMutation({
    mutationFn: (undoToken: string) =>
      demo
        ? mock<Omit<FeedbackResponse, "undoToken">>({
            ok: true,
            indexSize: 210 + --demoCorrections,
            correctionsTotal: demoCorrections,
          })
        : http<Omit<FeedbackResponse, "undoToken">>("/feedback/undo", {
            method: "POST",
            body: JSON.stringify({ undoToken }),
          }),
  });
}

export function useMetrics() {
  const { demo } = useDemoMode();
  return useQuery({
    queryKey: ["metrics", demo],
    queryFn: () => (demo ? mock<Metrics>(metricsMock) : http<Metrics>("/metrics")),
  });
}

export function useSources() {
  const { demo } = useDemoMode();
  return useQuery({
    queryKey: ["sources", demo],
    queryFn: () => (demo ? mock<Sources>(sourcesMock) : http<Sources>("/sources")),
  });
}
