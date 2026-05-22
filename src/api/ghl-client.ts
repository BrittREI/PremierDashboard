/**
 * GHL API client.
 *
 * All requests go through the Vercel serverless proxy at /api/ghl/*
 * which injects the GHL token and locationId server-side.
 * No secrets are ever exposed to the browser.
 */

import type {
  Pipeline,
  Opportunity,
  OpportunitySearchResult,
  ContactSearchResult,
  GhlUser,
  CallStats,
} from "@/types/ghl";

async function request<T>(
  method: string,
  path: string,
  opts: { query?: Record<string, unknown>; body?: unknown } = {}
): Promise<T> {
  // Always use the Vercel proxy — token stays server-side
  const url = new URL(`/api/ghl${path}`, window.location.origin);

  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }

  const fetchOpts: RequestInit = {
    method,
    headers: { Accept: "application/json", "Content-Type": "application/json" },
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
  // locationId injected server-side by the proxy
  const data = await request<{ pipelines: Pipeline[] }>(
    "GET",
    "/opportunities/pipelines",
    { query: { locationId: "" } }
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
      location_id: "",  // injected server-side by the proxy
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
      locationId: "",  // injected server-side by the proxy
      pageLimit: opts.limit ?? 100,
      query: opts.query,
      filters: filters.length ? filters : undefined,
      sort: [{ field: "dateAdded", direction: "desc" }],
    },
  });
}

export async function listUsers(): Promise<GhlUser[]> {
  const data = await request<{ users: GhlUser[] }>("GET", "/users/", {
    query: { locationId: "" },  // injected server-side by the proxy
  });
  return data.users;
}

/** Fetch call/conversation analytics from dedicated endpoint */
export async function fetchCallStats(): Promise<CallStats> {
  const res = await fetch(`/api/call-stats`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Call stats: ${res.status} - ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<CallStats>;
}
