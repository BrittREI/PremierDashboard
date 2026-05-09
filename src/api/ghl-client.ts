/**
 * GHL API client.
 *
 * - Dev: calls GHL directly using VITE_ env vars (for fast iteration)
 * - Production: calls /api/ghl/* proxy (token stays server-side)
 */

import type {
  Pipeline,
  Opportunity,
  OpportunitySearchResult,
  ContactSearchResult,
  GhlUser,
} from "@/types/ghl";

const isDev = import.meta.env.DEV;

// Dev-only: direct GHL calls
const GHL_BASE = "https://services.leadconnectorhq.com";
const TOKEN = import.meta.env.VITE_GHL_API_KEY ?? "";
const LOCATION_ID = import.meta.env.VITE_GHL_LOCATION_ID ?? "";

function devHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${TOKEN}`,
    Version: "2021-07-28",
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function request<T>(
  method: string,
  path: string,
  opts: { query?: Record<string, unknown>; body?: unknown } = {}
): Promise<T> {
  let url: URL;

  if (isDev) {
    // Direct to GHL in development
    url = new URL(GHL_BASE + path);
  } else {
    // Through Vercel proxy in production
    url = new URL(`/api/ghl${path}`, window.location.origin);
  }

  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }

  const fetchOpts: RequestInit = {
    method,
    headers: isDev
      ? devHeaders()
      : { Accept: "application/json", "Content-Type": "application/json" },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  };

  const res = await fetch(url.toString(), fetchOpts);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `GHL ${method} ${path}: ${res.status} ${res.statusText} - ${text.slice(0, 300)}`
    );
  }
  return res.json() as Promise<T>;
}

// ─── Endpoints ───────────────────────────────────────────

export async function listPipelines(): Promise<Pipeline[]> {
  const data = await request<{ pipelines: Pipeline[] }>(
    "GET",
    "/opportunities/pipelines",
    { query: { locationId: LOCATION_ID } }
  );
  return data.pipelines;
}

export async function searchOpportunities(opts: {
  pipelineId?: string;
  stageId?: string;
  status?: string;
  assignedTo?: string;
  page?: number;
  limit?: number;
}): Promise<OpportunitySearchResult> {
  return request<OpportunitySearchResult>("GET", "/opportunities/search", {
    query: {
      location_id: LOCATION_ID,
      pipeline_id: opts.pipelineId,
      pipeline_stage_id: opts.stageId,
      assigned_to: opts.assignedTo,
      status: opts.status && opts.status !== "all" ? opts.status : undefined,
      page: opts.page ?? 1,
      limit: opts.limit ?? 100,
    },
  });
}

/** Fetch ALL opportunities for a pipeline, handling pagination */
export async function fetchAllOpportunities(
  pipelineId: string
): Promise<Opportunity[]> {
  const all: Opportunity[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const result = await searchOpportunities({ pipelineId, page, limit: 100 });
    all.push(...result.opportunities);
    hasMore = result.meta.nextPageUrl !== null && result.meta.nextPageUrl !== "";
    page++;
    if (page > 20) break; // safety valve
  }
  return all;
}

export async function searchContacts(opts: {
  query?: string;
  tag?: string;
  limit?: number;
  dateAddedAfter?: number;
  dateAddedBefore?: number;
}): Promise<ContactSearchResult> {
  const filters: Array<{
    field: string;
    operator: string;
    value: unknown;
  }> = [];
  if (opts.tag)
    filters.push({ field: "tags", operator: "contains", value: opts.tag });
  if (opts.dateAddedAfter !== undefined)
    filters.push({
      field: "dateAdded",
      operator: "gte",
      value: opts.dateAddedAfter,
    });
  if (opts.dateAddedBefore !== undefined)
    filters.push({
      field: "dateAdded",
      operator: "lt",
      value: opts.dateAddedBefore,
    });

  return request<ContactSearchResult>("POST", "/contacts/search", {
    body: {
      locationId: LOCATION_ID,
      pageLimit: opts.limit ?? 100,
      query: opts.query,
      filters: filters.length ? filters : undefined,
      sort: [{ field: "dateAdded", direction: "desc" }],
    },
  });
}

export async function listUsers(): Promise<GhlUser[]> {
  const data = await request<{ users: GhlUser[] }>("GET", "/users/", {
    query: { locationId: LOCATION_ID },
  });
  return data.users;
}
