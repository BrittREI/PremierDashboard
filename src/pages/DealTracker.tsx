import { useMemo, useState } from "react";
import { useAllOpportunities, usePipelines } from "@/hooks/useGhlData";
import { formatCurrency, formatDate, getLeadSource } from "@/lib/utils";
import { USERS, PIPELINES, getDealRevenue } from "@/types/ghl";
import type { Opportunity, Pipeline } from "@/types/ghl";
import { cn } from "@/lib/utils";

function getStageName(
  pipelines: Pipeline[] | undefined,
  opp: Opportunity
): string {
  const pipeline = pipelines?.find((p) => p.id === opp.pipelineId);
  const stage = pipeline?.stages.find((s) => s.id === opp.pipelineStageId);
  return stage?.name ?? "Unknown";
}

function getPipelineName(pipelineId: string): string {
  if (pipelineId === PIPELINES.leadManagement.id) return "Lead Mgmt";
  if (pipelineId === PIPELINES.acquisitions.id) return "Acquisitions";
  if (pipelineId === PIPELINES.disposition.id) return "Disposition";
  if (pipelineId === PIPELINES.archive2024.id) return "Archive 2024";
  if (pipelineId === PIPELINES.archive2025.id) return "Archive 2025";
  return "Other";
}

function statusBadge(status: string, stageName: string) {
  if (stageName === "Closed Won")
    return (
      <span className="px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
        Won
      </span>
    );
  if (stageName === "Closed Lost")
    return (
      <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
        Lost
      </span>
    );
  if (status === "abandoned")
    return (
      <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
        Abandoned
      </span>
    );
  if (stageName === "Delayed")
    return (
      <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
        Delayed
      </span>
    );
  return (
    <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
      Open
    </span>
  );
}

type SortField = "name" | "value" | "stage" | "date" | "pipeline";
type SortDir = "asc" | "desc";

export function DealTracker() {
  const { data: pipelines } = usePipelines();
  const { all, isLoading } = useAllOpportunities();
  const [filterPipeline, setFilterPipeline] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const filtered = useMemo(() => {
    let list = all;
    if (filterPipeline !== "all") {
      list = list.filter((o) => o.pipelineId === filterPipeline);
    }

    list.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortField) {
        case "name":
          return dir * a.name.localeCompare(b.name);
        case "value":
          return dir * (getDealRevenue(a) - getDealRevenue(b));
        case "stage":
          return (
            dir *
            getStageName(pipelines, a).localeCompare(
              getStageName(pipelines, b)
            )
          );
        case "pipeline":
          return (
            dir *
            getPipelineName(a.pipelineId).localeCompare(
              getPipelineName(b.pipelineId)
            )
          );
        case "date":
        default:
          return (
            dir *
            (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          );
      }
    });

    return list;
  }, [all, filterPipeline, sortField, sortDir, pipelines]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return "↕";
    return sortDir === "asc" ? "↑" : "↓";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Deal Tracker</h1>
          <p className="text-slate-500 mt-1">
            All active deals across pipelines —{" "}
            <strong>{filtered.length}</strong> total
          </p>
        </div>
        <div>
          <select
            value={filterPipeline}
            onChange={(e) => setFilterPipeline(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="all">All Pipelines</option>
            <option value={PIPELINES.leadManagement.id}>Lead Management</option>
            <option value={PIPELINES.acquisitions.id}>Acquisitions</option>
            <option value={PIPELINES.disposition.id}>Disposition</option>
            <option value={PIPELINES.archive2024.id}>[Archive] 2024 Deals</option>
            <option value={PIPELINES.archive2025.id}>[Archive] 2025 Deals</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-slate-500 text-left">
                <th
                  className="px-6 py-3 font-medium cursor-pointer hover:text-slate-800"
                  onClick={() => toggleSort("name")}
                >
                  Deal {sortIcon("name")}
                </th>
                <th
                  className="px-6 py-3 font-medium cursor-pointer hover:text-slate-800"
                  onClick={() => toggleSort("pipeline")}
                >
                  Pipeline {sortIcon("pipeline")}
                </th>
                <th
                  className="px-6 py-3 font-medium cursor-pointer hover:text-slate-800"
                  onClick={() => toggleSort("stage")}
                >
                  Stage {sortIcon("stage")}
                </th>
                <th
                  className="px-6 py-3 font-medium cursor-pointer hover:text-slate-800 text-right"
                  onClick={() => toggleSort("value")}
                >
                  Value {sortIcon("value")}
                </th>
                <th className="px-6 py-3 font-medium">Assigned To</th>
                <th className="px-6 py-3 font-medium">Source</th>
                <th className="px-6 py-3 font-medium">Contact</th>
                <th
                  className="px-6 py-3 font-medium cursor-pointer hover:text-slate-800"
                  onClick={() => toggleSort("date")}
                >
                  Created {sortIcon("date")}
                </th>
                <th className="px-6 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((opp) => {
                const stageName = getStageName(pipelines, opp);
                return (
                  <tr
                    key={opp.id}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-6 py-3 font-medium text-slate-900 max-w-[250px] truncate">
                      {opp.name || "—"}
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {getPipelineName(opp.pipelineId)}
                    </td>
                    <td className="px-6 py-3 text-slate-600">{stageName}</td>
                    <td className="px-6 py-3 text-right font-medium">
                      {getDealRevenue(opp) > 0
                        ? formatCurrency(getDealRevenue(opp))
                        : "—"}
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {opp.assignedTo
                        ? USERS[opp.assignedTo] ?? "Unknown"
                        : "—"}
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {getLeadSource(opp)}
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {opp.contact?.name || "—"}
                    </td>
                    <td className="px-6 py-3 text-slate-500">
                      {formatDate(opp.createdAt)}
                    </td>
                    <td className="px-6 py-3">
                      {statusBadge(opp.status, stageName)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-6 py-12 text-center text-slate-400"
                  >
                    No deals found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
