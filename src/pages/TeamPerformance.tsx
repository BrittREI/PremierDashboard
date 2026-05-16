import { useMemo } from "react";
import { Users, Trophy, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { BarChartHorizontal } from "@/components/charts/BarChartHorizontal";
import { useAllOpportunities } from "@/hooks/useGhlData";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { USERS, getDealRevenue } from "@/types/ghl";
import type { TeamMemberMetrics, Opportunity } from "@/types/ghl";

// Closed Won/Lost stage IDs across disposition + archive pipelines
const CLOSED_WON_STAGES = new Set([
  "3e83fed8-a5cb-4b27-b1f9-4277cc7642ef",
  "6a367f1a-4ff7-428f-be3d-2df51570b022",
  "095c237a-dce9-4327-9cc4-6132fad13eb6",
]);
const CLOSED_LOST_STAGES = new Set([
  "a8f59eda-3bac-4b15-8441-5ed852f965f0",
  "41b66375-0d1d-42e3-ac1f-b23a29e32569",
  "92f99411-6a4c-451d-baf2-dc5974be1ffe",
]);

function buildTeamMetrics(opps: Opportunity[]): TeamMemberMetrics[] {
  const map = new Map<string, TeamMemberMetrics>();

  // Init all known users
  for (const [id, name] of Object.entries(USERS)) {
    map.set(id, {
      userId: id,
      userName: name,
      assignedLeads: 0,
      assignedDeals: 0,
      closedWon: 0,
      closedLost: 0,
      totalValue: 0,
      winRate: 0,
    });
  }

  // Also track unassigned
  map.set("unassigned", {
    userId: "unassigned",
    userName: "Unassigned",
    assignedLeads: 0,
    assignedDeals: 0,
    closedWon: 0,
    closedLost: 0,
    totalValue: 0,
    winRate: 0,
  });

  for (const opp of opps) {
    const key = opp.assignedTo ?? "unassigned";
    let m = map.get(key);
    if (!m) {
      m = {
        userId: key,
        userName: USERS[key] ?? key,
        assignedLeads: 0,
        assignedDeals: 0,
        closedWon: 0,
        closedLost: 0,
        totalValue: 0,
        winRate: 0,
      };
      map.set(key, m);
    }

    m.assignedDeals++;
    m.totalValue += getDealRevenue(opp);

    if (CLOSED_WON_STAGES.has(opp.pipelineStageId)) {
      m.closedWon++;
    }
    if (CLOSED_LOST_STAGES.has(opp.pipelineStageId) || opp.status === "lost") {
      m.closedLost++;
    }
  }

  // Calculate win rates
  for (const m of map.values()) {
    const total = m.closedWon + m.closedLost;
    m.winRate = total > 0 ? (m.closedWon / total) * 100 : 0;
  }

  return Array.from(map.values())
    .filter((m) => m.assignedDeals > 0)
    .sort((a, b) => b.assignedDeals - a.assignedDeals);
}

export function TeamPerformance() {
  const { all, isLoading } = useAllOpportunities();

  const metrics = useMemo(() => buildTeamMetrics(all), [all]);

  const topPerformer = useMemo(
    () =>
      metrics.reduce(
        (best, m) => (m.totalValue > best.totalValue ? m : best),
        metrics[0]
      ),
    [metrics]
  );

  const totalAssigned = metrics.reduce((s, m) => s + m.assignedDeals, 0);

  // Chart data
  const dealCountData = useMemo(
    () => metrics.map((m) => ({ name: m.userName, value: m.assignedDeals })),
    [metrics]
  );

  const dealValueData = useMemo(
    () => metrics.filter((m) => m.totalValue > 0).map((m) => ({ name: m.userName, value: m.totalValue })),
    [metrics]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Team Performance</h1>
        <p className="text-slate-500 mt-1">
          Individual performance across all pipelines
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Active Team Members"
          value={metrics.filter((m) => m.userId !== "unassigned").length}
          subtitle="With assigned deals"
          icon={<Users className="w-5 h-5" />}
        />
        <StatCard
          title="Top Performer"
          value={topPerformer?.userName ?? "—"}
          subtitle={`${formatCurrency(topPerformer?.totalValue ?? 0)} total value`}
          icon={<Trophy className="w-5 h-5" />}
        />
        <StatCard
          title="Total Assignments"
          value={totalAssigned}
          subtitle="Across all pipelines"
          icon={<TrendingUp className="w-5 h-5" />}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">
            Deals by Team Member
          </h3>
          <BarChartHorizontal data={dealCountData} color="#3b82f6" />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">
            Deal Value by Team Member
          </h3>
          <BarChartHorizontal data={dealValueData} isCurrency color="#10b981" />
        </div>
      </div>

      {/* Detailed table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">
            Detailed Breakdown
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-slate-500 text-left">
                <th className="px-6 py-3 font-medium">Team Member</th>
                <th className="px-6 py-3 font-medium text-right">
                  Assigned Deals
                </th>
                <th className="px-6 py-3 font-medium text-right">
                  Total Value
                </th>
                <th className="px-6 py-3 font-medium text-right">
                  Closed Won
                </th>
                <th className="px-6 py-3 font-medium text-right">
                  Closed Lost
                </th>
                <th className="px-6 py-3 font-medium text-right">Win Rate</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr
                  key={m.userId}
                  className="border-t border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-6 py-3 font-medium text-slate-900">
                    {m.userName}
                  </td>
                  <td className="px-6 py-3 text-right">{m.assignedDeals}</td>
                  <td className="px-6 py-3 text-right">
                    {formatCurrency(m.totalValue)}
                  </td>
                  <td className="px-6 py-3 text-right text-emerald-600 font-medium">
                    {m.closedWon}
                  </td>
                  <td className="px-6 py-3 text-right text-red-500 font-medium">
                    {m.closedLost}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {m.closedWon + m.closedLost > 0
                      ? formatPercent(m.winRate)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
