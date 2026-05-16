import { useMemo } from "react";
import {
  Calendar,
  TrendingUp,
  Phone,
  Mail,
  Users as UsersIcon,
  ArrowRight,
} from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { DonutChart } from "@/components/charts/DonutChart";
import {
  useAllOpportunities,
  usePipelines,
  useContacts,
} from "@/hooks/useGhlData";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Opportunity, Pipeline } from "@/types/ghl";
import {
  USERS,
  PIPELINES,
  getDealRevenue,
  getPurchasePrice,
  getBuyerPrice,
  buildStageMap,
  getLeadChannel,
} from "@/types/ghl";

/** Get start of the current week (Monday 00:00 UTC) */
function getWeekStart(): Date {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getWeekEnd(): Date {
  const start = getWeekStart();
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return end;
}

function isThisWeek(dateStr: string): boolean {
  const d = new Date(dateStr);
  return d >= getWeekStart() && d < getWeekEnd();
}

function isLast7Days(dateStr: string): boolean {
  const d = new Date(dateStr);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  cutoff.setHours(0, 0, 0, 0);
  return d >= cutoff;
}

const CHANNEL_COLORS: Record<string, string> = {
  DIY: "#3b82f6",
  REMail: "#f59e0b",
  PPL: "#8b5cf6",
  Other: "#94a3b8",
};

export function WeeklyReport() {
  const {
    leadManagement,
    acquisitions,
    disposition,
    allDeals,
    all,
    isLoading: oppsLoading,
  } = useAllOpportunities();
  const pipelinesQuery = usePipelines();

  // Get contacts added in the last 7 days
  const weekStart = getWeekStart();
  const recentContacts = useContacts({
    dateAddedAfter: weekStart.getTime(),
    limit: 100,
  });

  const stageMap = useMemo(
    () => buildStageMap(pipelinesQuery.data ?? []),
    [pipelinesQuery.data]
  );

  // --- New leads this week (from opportunities created this week) ---
  const newLeadMgmt = useMemo(
    () => leadManagement.filter((o) => isLast7Days(o.createdAt)),
    [leadManagement]
  );
  const newAcquisitions = useMemo(
    () => acquisitions.filter((o) => isLast7Days(o.createdAt)),
    [acquisitions]
  );
  const newDisposition = useMemo(
    () => disposition.filter((o) => isLast7Days(o.createdAt)),
    [disposition]
  );

  // --- Lead source breakdown for new leads ---
  const sourceBreakdown = useMemo(() => {
    const allNew = [...newLeadMgmt, ...newAcquisitions, ...newDisposition];
    const counts = { DIY: 0, REMail: 0, PPL: 0, Other: 0 };
    for (const opp of allNew) {
      const channel = getLeadChannel(opp);
      counts[channel]++;
    }
    return counts;
  }, [newLeadMgmt, newAcquisitions, newDisposition]);

  const totalNewLeads =
    sourceBreakdown.DIY +
    sourceBreakdown.REMail +
    sourceBreakdown.PPL +
    sourceBreakdown.Other;

  // --- Pipeline stage snapshots ---
  const leadMgmtByStage = useMemo(() => {
    const map = new Map<string, number>();
    for (const opp of leadManagement) {
      if (opp.status !== "open") continue;
      const name = stageMap[opp.pipelineStageId] ?? "Unknown";
      map.set(name, (map.get(name) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [leadManagement, stageMap]);

  const acqByStage = useMemo(() => {
    const map = new Map<string, number>();
    for (const opp of acquisitions) {
      if (opp.status !== "open") continue;
      const name = stageMap[opp.pipelineStageId] ?? "Unknown";
      map.set(name, (map.get(name) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [acquisitions, stageMap]);

  const dispoByStage = useMemo(() => {
    const map = new Map<string, number>();
    for (const opp of disposition) {
      const name = stageMap[opp.pipelineStageId] ?? "Unknown";
      map.set(name, (map.get(name) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [disposition, stageMap]);

  // --- Stage movement this week ---
  const stageMovements = useMemo(() => {
    return all
      .filter(
        (opp) =>
          isLast7Days(opp.lastStageChangeAt) &&
          opp.lastStageChangeAt !== opp.createdAt
      )
      .sort(
        (a, b) =>
          new Date(b.lastStageChangeAt).getTime() -
          new Date(a.lastStageChangeAt).getTime()
      )
      .slice(0, 20);
  }, [all]);

  // --- Active disposition deals (not closed/delayed) ---
  const activeDeals = useMemo(() => {
    return disposition.filter((d) => {
      const name = (stageMap[d.pipelineStageId] ?? "").toLowerCase();
      return (
        d.status === "open" &&
        !name.includes("closed") &&
        !name.includes("delayed")
      );
    });
  }, [disposition, stageMap]);

  // --- Donut chart data ---
  const donutData = useMemo(
    () =>
      Object.entries(sourceBreakdown)
        .filter(([, v]) => v > 0)
        .map(([name, value]) => ({ name, value })),
    [sourceBreakdown]
  );

  // --- Assignee breakdown for new leads ---
  const assigneeBreakdown = useMemo(() => {
    const allNew = [...newLeadMgmt, ...newAcquisitions];
    const map = new Map<string, number>();
    for (const opp of allNew) {
      const name = opp.assignedTo
        ? USERS[opp.assignedTo] ?? "Unknown"
        : "Unassigned";
      map.set(name, (map.get(name) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [newLeadMgmt, newAcquisitions]);

  const weekLabel = `${formatDate(weekStart)} – ${formatDate(getWeekEnd())}`;

  if (oppsLoading || pipelinesQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Weekly Report</h1>
        <p className="text-slate-500 mt-1">
          Week of {weekLabel} · Pipeline activity &amp; lead sources
        </p>
      </div>

      {/* New Leads Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="New Leads (7d)"
          value={totalNewLeads}
          subtitle="entered pipeline"
          icon={<Calendar className="w-5 h-5" />}
        />
        <StatCard
          title="DIY / Cold Calling"
          value={sourceBreakdown.DIY}
          subtitle={`${totalNewLeads > 0 ? Math.round((sourceBreakdown.DIY / totalNewLeads) * 100) : 0}% of new`}
          icon={<Phone className="w-5 h-5" />}
        />
        <StatCard
          title="REMail / Direct Mail"
          value={sourceBreakdown.REMail}
          subtitle={`${totalNewLeads > 0 ? Math.round((sourceBreakdown.REMail / totalNewLeads) * 100) : 0}% of new`}
          icon={<Mail className="w-5 h-5" />}
        />
        <StatCard
          title="PPL / Other"
          value={sourceBreakdown.PPL + sourceBreakdown.Other}
          subtitle="paid + unattributed"
          icon={<UsersIcon className="w-5 h-5" />}
        />
        <StatCard
          title="Stage Movements"
          value={stageMovements.length}
          subtitle="deals progressed"
          icon={<ArrowRight className="w-5 h-5" />}
        />
      </div>

      {/* Source breakdown + assignee charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">
            Lead Source Mix (Last 7 Days)
          </h3>
          {donutData.length > 0 ? (
            <DonutChart
              data={donutData}
              centerLabel="Total"
              centerValue={String(totalNewLeads)}
            />
          ) : (
            <p className="text-sm text-slate-400 py-8 text-center">
              No new leads this week
            </p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">
            New Leads by Assignee
          </h3>
          {assigneeBreakdown.length > 0 ? (
            <div className="space-y-3">
              {assigneeBreakdown.map(({ name, count }) => {
                const pct =
                  totalNewLeads > 0
                    ? Math.round((count / totalNewLeads) * 100)
                    : 0;
                return (
                  <div key={name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-slate-700">{name}</span>
                      <span className="text-slate-500">
                        {count} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-400 py-8 text-center">
              No assignments this week
            </p>
          )}
        </div>
      </div>

      {/* Pipeline Snapshots */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <PipelineSnapshot
          title="Lead Management"
          total={leadManagement.filter((o) => o.status === "open").length}
          newThisWeek={newLeadMgmt.length}
          stages={leadMgmtByStage}
        />
        <PipelineSnapshot
          title="Acquisitions"
          total={acquisitions.filter((o) => o.status === "open").length}
          newThisWeek={newAcquisitions.length}
          stages={acqByStage}
        />
        <PipelineSnapshot
          title="Disposition"
          total={disposition.length}
          newThisWeek={newDisposition.length}
          stages={dispoByStage}
        />
      </div>

      {/* Active Deals Table (Disposition) */}
      {activeDeals.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Active Disposition Deals — {activeDeals.length} in progress
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-slate-500 text-left">
                  <th className="px-5 py-3 font-medium">Property</th>
                  <th className="px-5 py-3 font-medium">Stage</th>
                  <th className="px-5 py-3 font-medium text-right">
                    Purchase Price
                  </th>
                  <th className="px-5 py-3 font-medium text-right">
                    Buyer Price
                  </th>
                  <th className="px-5 py-3 font-medium text-right">
                    Assignment Fee
                  </th>
                  <th className="px-5 py-3 font-medium">Assigned To</th>
                  <th className="px-5 py-3 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {activeDeals.map((d) => (
                  <tr
                    key={d.id}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-5 py-3 font-medium text-slate-900 max-w-[220px] truncate">
                      {d.name || "—"}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {stageMap[d.pipelineStageId] ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {getPurchasePrice(d) > 0
                        ? formatCurrency(getPurchasePrice(d))
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {getBuyerPrice(d) > 0
                        ? formatCurrency(getBuyerPrice(d))
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-emerald-600">
                      {getDealRevenue(d) > 0
                        ? formatCurrency(getDealRevenue(d))
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {d.assignedTo ? USERS[d.assignedTo] ?? "Unknown" : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <ChannelBadge channel={getLeadChannel(d)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stage Movements Table */}
      {stageMovements.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Stage Movement (Last 7 Days)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-slate-500 text-left">
                  <th className="px-5 py-3 font-medium">Deal</th>
                  <th className="px-5 py-3 font-medium">Pipeline</th>
                  <th className="px-5 py-3 font-medium">Moved To</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Source</th>
                  <th className="px-5 py-3 font-medium">Contact</th>
                </tr>
              </thead>
              <tbody>
                {stageMovements.map((opp) => (
                  <tr
                    key={opp.id}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-5 py-3 font-medium text-slate-900 max-w-[200px] truncate">
                      {opp.name || "—"}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {getPipelineLabel(opp.pipelineId)}
                    </td>
                    <td className="px-5 py-3">
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                        {stageMap[opp.pipelineStageId] ?? "Unknown"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      {formatDate(opp.lastStageChangeAt)}
                    </td>
                    <td className="px-5 py-3">
                      <ChannelBadge channel={getLeadChannel(opp)} />
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {opp.contact?.name || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Leads Table */}
      {newLeadMgmt.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              New Leads Entered Pipeline (Last 7 Days) —{" "}
              {newLeadMgmt.length + newAcquisitions.length} total
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-slate-500 text-left">
                  <th className="px-5 py-3 font-medium">Lead</th>
                  <th className="px-5 py-3 font-medium">Pipeline</th>
                  <th className="px-5 py-3 font-medium">Stage</th>
                  <th className="px-5 py-3 font-medium">Source</th>
                  <th className="px-5 py-3 font-medium">Assigned To</th>
                  <th className="px-5 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {[...newLeadMgmt, ...newAcquisitions]
                  .sort(
                    (a, b) =>
                      new Date(b.createdAt).getTime() -
                      new Date(a.createdAt).getTime()
                  )
                  .map((opp) => (
                    <tr
                      key={opp.id}
                      className="border-t border-slate-100 hover:bg-slate-50"
                    >
                      <td className="px-5 py-3 font-medium text-slate-900 max-w-[220px] truncate">
                        {opp.name || opp.contact?.name || "—"}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {getPipelineLabel(opp.pipelineId)}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {stageMap[opp.pipelineStageId] ?? "—"}
                      </td>
                      <td className="px-5 py-3">
                        <ChannelBadge channel={getLeadChannel(opp)} />
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {opp.assignedTo
                          ? USERS[opp.assignedTo] ?? "Unknown"
                          : "—"}
                      </td>
                      <td className="px-5 py-3 text-slate-500">
                        {formatDate(opp.createdAt)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Helper components ---

function PipelineSnapshot({
  title,
  total,
  newThisWeek,
  stages,
}: {
  title: string;
  total: number;
  newThisWeek: number;
  stages: { name: string; count: number }[];
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
          +{newThisWeek} new
        </span>
      </div>
      <p className="text-2xl font-bold text-slate-900 mb-3">{total}</p>
      <div className="space-y-2">
        {stages.slice(0, 6).map(({ name, count }) => (
          <div
            key={name}
            className="flex justify-between text-xs text-slate-600"
          >
            <span>{name}</span>
            <span className="font-medium">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChannelBadge({ channel }: { channel: string }) {
  const colors: Record<string, string> = {
    DIY: "bg-blue-100 text-blue-700",
    REMail: "bg-amber-100 text-amber-700",
    PPL: "bg-purple-100 text-purple-700",
    Other: "bg-slate-100 text-slate-600",
  };
  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium ${colors[channel] ?? colors.Other}`}
    >
      {channel}
    </span>
  );
}

function getPipelineLabel(pipelineId: string): string {
  if (pipelineId === PIPELINES.leadManagement.id) return "Lead Mgmt";
  if (pipelineId === PIPELINES.acquisitions.id) return "Acquisitions";
  if (pipelineId === PIPELINES.disposition.id) return "Disposition";
  if (pipelineId === PIPELINES.archive2024.id) return "Archive 2024";
  if (pipelineId === PIPELINES.archive2025.id) return "Archive 2025";
  return "Other";
}
