import { useMemo } from "react";
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Target,
  Users,
  CheckCircle,
} from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { DonutChart } from "@/components/charts/DonutChart";
import { BarChartHorizontal } from "@/components/charts/BarChartHorizontal";
import { useAllOpportunities } from "@/hooks/useGhlData";
import { formatCurrency, formatPercent, getLeadSource } from "@/lib/utils";
import type { Opportunity } from "@/types/ghl";
import { PIPELINES, USERS, getDealRevenue } from "@/types/ghl";

function computeKpis(
  leads: Opportunity[],
  deals: Opportunity[],
  dispositions: Opportunity[]
) {
  const openDeals = dispositions.filter(
    (d) => d.status === "open" && !isClosedStage(d)
  );
  const closedWon = dispositions.filter((d) => isClosedWonStage(d));
  const closedLost = dispositions.filter(
    (d) => isClosedLostStage(d) || d.status === "lost"
  );

  const totalRevenue = closedWon.reduce((s, d) => s + getDealRevenue(d), 0);
  const pipelineValue = openDeals.reduce((s, d) => s + getDealRevenue(d), 0);
  const winCount = closedWon.length;
  const lossCount = closedLost.length;
  const winRate = winCount + lossCount > 0
    ? (winCount / (winCount + lossCount)) * 100
    : 0;
  const avgDealSize = winCount > 0 ? totalRevenue / winCount : 0;

  return {
    totalLeads: leads.length,
    totalDeals: deals.length,
    totalDispositions: dispositions.length,
    openDeals: openDeals.length,
    closedWon: winCount,
    closedLost: lossCount,
    totalRevenue,
    pipelineValue,
    winRate,
    avgDealSize,
  };
}

// Closed Won stage IDs across disposition + archive pipelines
const CLOSED_WON_STAGES = new Set([
  "3e83fed8-a5cb-4b27-b1f9-4277cc7642ef", // Disposition
  "6a367f1a-4ff7-428f-be3d-2df51570b022", // Archive 2024
  "095c237a-dce9-4327-9cc4-6132fad13eb6", // Archive 2025
]);

const CLOSED_LOST_STAGES = new Set([
  "a8f59eda-3bac-4b15-8441-5ed852f965f0", // Disposition
  "41b66375-0d1d-42e3-ac1f-b23a29e32569", // Archive 2024
  "92f99411-6a4c-451d-baf2-dc5974be1ffe", // Archive 2025
]);

function isClosedWonStage(opp: Opportunity): boolean {
  return CLOSED_WON_STAGES.has(opp.pipelineStageId);
}

function isClosedLostStage(opp: Opportunity): boolean {
  return CLOSED_LOST_STAGES.has(opp.pipelineStageId);
}

function isClosedStage(opp: Opportunity): boolean {
  return isClosedWonStage(opp) || isClosedLostStage(opp);
}

export function KpiReport() {
  const { leadManagement, acquisitions, disposition, isLoading } =
    useAllOpportunities();

  const kpis = useMemo(
    () => computeKpis(leadManagement, acquisitions, disposition),
    [leadManagement, acquisitions, disposition]
  );

  // Status breakdown for donut
  const statusData = useMemo(
    () => [
      { name: "Closed Won", value: kpis.closedWon },
      { name: "Closed Lost", value: kpis.closedLost },
      {
        name: "Open",
        value: kpis.totalDispositions - kpis.closedWon - kpis.closedLost,
      },
    ],
    [kpis]
  );

  // Revenue by deal (top 10 by value)
  const revenueByDeal = useMemo(() => {
    return disposition
      .filter((d) => getDealRevenue(d) > 0)
      .sort((a, b) => getDealRevenue(b) - getDealRevenue(a))
      .slice(0, 8)
      .map((d) => ({
        name: d.name.length > 25 ? d.name.slice(0, 25) + "..." : d.name,
        value: getDealRevenue(d),
      }));
  }, [disposition]);

  // Deals by assignee
  const dealsByAssignee = useMemo(() => {
    const map = new Map<string, number>();
    disposition.forEach((d) => {
      const name = d.assignedTo
        ? USERS[d.assignedTo] ?? "Unknown"
        : "Unassigned";
      map.set(name, (map.get(name) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [disposition]);

  // Lead sources
  const leadSourceData = useMemo(() => {
    const map = new Map<string, number>();
    [...leadManagement, ...disposition].forEach((opp) => {
      const src = getLeadSource(opp);
      map.set(src, (map.get(src) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [leadManagement, disposition]);

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
        <h1 className="text-2xl font-bold text-slate-900">KPI Report</h1>
        <p className="text-slate-500 mt-1">
          Weekly/monthly performance snapshot across all pipelines
        </p>
      </div>

      {/* Top-level KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Revenue"
          value={formatCurrency(kpis.totalRevenue)}
          subtitle="Closed Won deals"
          icon={<DollarSign className="w-5 h-5" />}
        />
        <StatCard
          title="Pipeline Value"
          value={formatCurrency(kpis.pipelineValue)}
          subtitle={`${kpis.openDeals} open deals`}
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <StatCard
          title="Win Rate"
          value={formatPercent(kpis.winRate)}
          subtitle={`${kpis.closedWon}W / ${kpis.closedLost}L`}
          icon={<Target className="w-5 h-5" />}
        />
        <StatCard
          title="Avg Deal Size"
          value={formatCurrency(kpis.avgDealSize)}
          subtitle="Closed Won avg"
          icon={<BarChart3 className="w-5 h-5" />}
        />
      </div>

      {/* Pipeline counts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Lead Management"
          value={kpis.totalLeads}
          subtitle="Active leads in pipeline"
          icon={<Users className="w-5 h-5" />}
        />
        <StatCard
          title="Acquisitions"
          value={kpis.totalDeals}
          subtitle="Active acquisition deals"
          icon={<Target className="w-5 h-5" />}
        />
        <StatCard
          title="Dispositions"
          value={kpis.totalDispositions}
          subtitle="Total disposition deals"
          icon={<CheckCircle className="w-5 h-5" />}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">
            Deal Outcomes
          </h3>
          <DonutChart
            data={statusData}
            centerLabel="Total"
            centerValue={String(kpis.totalDispositions)}
          />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">
            Lead Sources
          </h3>
          <DonutChart data={leadSourceData} centerLabel="Sources" centerValue={String(leadSourceData.length)} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">
            Top Deals by Value
          </h3>
          <BarChartHorizontal data={revenueByDeal} isCurrency color="#10b981" />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">
            Deals by Assignee
          </h3>
          <BarChartHorizontal data={dealsByAssignee} color="#6366f1" />
        </div>
      </div>
    </div>
  );
}
