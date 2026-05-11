import { useMemo, useState } from "react";
import {
  DollarSign,
  TrendingUp,
  Trophy,
  XCircle,
  Target,
  BarChart3,
} from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { StackedBarChart } from "@/components/charts/StackedBarChart";
import { useAllOpportunities, useContacts } from "@/hooks/useGhlData";
import { formatCurrency, formatPercent } from "@/lib/utils";
import type { Opportunity } from "@/types/ghl";
import { USERS } from "@/types/ghl";

type TimePeriod = "all" | "2024" | "2025" | "2026";

// Disposition pipeline stage IDs
const CLOSED_WON_STAGE = "3e83fed8-a5cb-4b27-b1f9-4277cc7642ef";
const CLOSED_LOST_STAGE = "a8f59eda-3bac-4b15-8441-5ed852f965f0";
const DELAYED_STAGE = "c04a1246-5853-4391-ab2a-d6553882b12c";

function getYearQuarter(dateStr: string) {
  const d = new Date(dateStr);
  const m = d.getMonth();
  return {
    year: d.getFullYear(),
    quarter: m < 3 ? 1 : m < 6 ? 2 : m < 9 ? 3 : 4,
  };
}

function isClosedWon(opp: Opportunity) {
  return opp.pipelineStageId === CLOSED_WON_STAGE;
}

function isClosedLost(opp: Opportunity) {
  return (
    opp.pipelineStageId === CLOSED_LOST_STAGE || opp.status === "lost"
  );
}

function isActive(opp: Opportunity) {
  return (
    !isClosedWon(opp) &&
    !isClosedLost(opp) &&
    opp.pipelineStageId !== DELAYED_STAGE &&
    opp.status === "open"
  );
}

interface QuarterData {
  won: Opportunity[];
  lost: Opportunity[];
}

interface YearData {
  Q1: QuarterData;
  Q2: QuarterData;
  Q3: QuarterData;
  Q4: QuarterData;
}

function emptyYear(): YearData {
  return {
    Q1: { won: [], lost: [] },
    Q2: { won: [], lost: [] },
    Q3: { won: [], lost: [] },
    Q4: { won: [], lost: [] },
  };
}

const QUARTER_LABELS: Record<string, string> = {
  Q1: "Q1 (Jan–Mar)",
  Q2: "Q2 (Apr–Jun)",
  Q3: "Q3 (Jul–Sep)",
  Q4: "Q4 (Oct–Dec)",
};

export function CeoDashboard() {
  const [period, setPeriod] = useState<TimePeriod>("all");
  const [stageFilter, setStageFilter] = useState("All");
  const { disposition, leadManagement, acquisitions, all, isLoading } =
    useAllOpportunities();
  const contacts2024 = useContacts({
    dateAddedAfter: new Date("2024-01-01").getTime(),
    dateAddedBefore: new Date("2025-01-01").getTime(),
    limit: 1,
  });
  const contacts2025 = useContacts({
    dateAddedAfter: new Date("2025-01-01").getTime(),
    dateAddedBefore: new Date("2026-01-01").getTime(),
    limit: 1,
  });
  const contacts2026 = useContacts({
    dateAddedAfter: new Date("2026-01-01").getTime(),
    limit: 1,
  });
  const contactsAll = useContacts({ limit: 1 });

  // Process deals into year/quarter structure
  const { won, lost, active, byYear } = useMemo(() => {
    const wonDeals = disposition.filter(isClosedWon);
    const lostDeals = disposition.filter(isClosedLost);
    const activeDeals = disposition.filter(isActive);

    const yearMap: Record<number, YearData> = {};

    const addTo = (
      arr: Opportunity[],
      type: "won" | "lost",
      dateField: "lastStatusChangeAt" | "updatedAt"
    ) => {
      for (const d of arr) {
        const date = d[dateField] || d.createdAt;
        if (!date) continue;
        const { year, quarter } = getYearQuarter(date);
        if (!yearMap[year]) yearMap[year] = emptyYear();
        const qKey = `Q${quarter}` as keyof YearData;
        yearMap[year][qKey][type].push(d);
      }
    };

    addTo(wonDeals, "won", "lastStatusChangeAt");
    addTo(lostDeals, "lost", "lastStatusChangeAt");

    return { won: wonDeals, lost: lostDeals, active: activeDeals, byYear: yearMap };
  }, [disposition]);

  // Gross lead counts from contacts
  const grossLeads: Record<string, number> = useMemo(
    () => ({
      all: contactsAll.data?.total ?? 0,
      "2024": contacts2024.data?.total ?? 0,
      "2025": contacts2025.data?.total ?? 0,
      "2026": contacts2026.data?.total ?? 0,
    }),
    [contactsAll.data, contacts2024.data, contacts2025.data, contacts2026.data]
  );

  // Filter for current period
  const periodWon = useMemo(() => {
    if (period === "all") return won;
    const yr = parseInt(period);
    return won.filter((d) => {
      const date = d.lastStatusChangeAt || d.createdAt;
      return date && getYearQuarter(date).year === yr;
    });
  }, [won, period]);

  const periodLost = useMemo(() => {
    if (period === "all") return lost;
    const yr = parseInt(period);
    return lost.filter((d) => {
      const date = d.lastStatusChangeAt || d.createdAt;
      return date && getYearQuarter(date).year === yr;
    });
  }, [lost, period]);

  // KPI calculations for current period
  const kpis = useMemo(() => {
    const totalRev = periodWon.reduce((s, d) => s + d.monetaryValue, 0);
    const avgFee = periodWon.length ? totalRev / periodWon.length : 0;
    const total = periodWon.length + periodLost.length;
    const closeRate = total > 0 ? (periodWon.length / total) * 100 : 0;

    // Funnel metrics
    const gross = grossLeads[period] || 0;
    const contracts = period === "all" ? disposition.length : disposition.filter((d) => {
      const yr = parseInt(period);
      return d.createdAt && getYearQuarter(d.createdAt).year === yr;
    }).length;

    // Unique contacts associated with deals as "net leads"
    const netLeadIds = new Set<string>();
    const periodDeals =
      period === "all"
        ? disposition
        : disposition.filter((d) => {
            const yr = parseInt(period);
            return d.createdAt && getYearQuarter(d.createdAt).year === yr;
          });
    for (const d of periodDeals) {
      if (d.contactId) netLeadIds.add(d.contactId);
    }

    return {
      totalRevenue: totalRev,
      avgFee,
      dealsWon: periodWon.length,
      dealsLost: periodLost.length,
      closeRate,
      activePipeline: active.length,
      grossLeads: gross,
      netLeads: netLeadIds.size,
      contracts,
    };
  }, [periodWon, periodLost, grossLeads, period, disposition, active]);

  // Annual comparison table data
  const annualData = useMemo(() => {
    const years = Object.keys(byYear)
      .map(Number)
      .sort();
    let prevRev: number | null = null;

    return years.map((yr) => {
      const yd = byYear[yr];
      const qs: (keyof YearData)[] = ["Q1", "Q2", "Q3", "Q4"];
      const yw = qs.flatMap((q) => yd[q].won);
      const yl = qs.flatMap((q) => yd[q].lost);
      const rev = yw.reduce((s, d) => s + d.monetaryValue, 0);
      const avg = yw.length ? rev / yw.length : 0;
      const total = yw.length + yl.length;
      const rate = total > 0 ? (yw.length / total) * 100 : 0;
      const vsPrior =
        prevRev !== null && prevRev > 0
          ? Math.round(((rev - prevRev) / prevRev) * 100)
          : null;
      prevRev = rev;

      const isCurrentYear = yr === new Date().getFullYear();
      return {
        year: isCurrentYear ? `${yr} YTD` : String(yr),
        won: yw.length,
        lost: yl.length,
        closeRate: rate,
        revenue: rev,
        avgFee: avg,
        vsPrior,
      };
    });
  }, [byYear]);

  // Quarterly chart data
  const quarterlyRevChart = useMemo(() => {
    if (period === "all") {
      // Show all quarters across years
      const years = Object.keys(byYear)
        .map(Number)
        .sort();
      const data: Array<{ label: string; revenue: number }> = [];
      for (const yr of years) {
        for (const q of ["Q1", "Q2", "Q3", "Q4"] as const) {
          const qd = byYear[yr]?.[q];
          if (!qd || (!qd.won.length && !qd.lost.length)) continue;
          data.push({
            label: `${yr} ${q}`,
            revenue: qd.won.reduce((s, d) => s + d.monetaryValue, 0),
          });
        }
      }
      return data;
    }
    const yr = parseInt(period);
    const yd = byYear[yr];
    if (!yd) return [];
    return (["Q1", "Q2", "Q3", "Q4"] as const).map((q) => ({
      label: q,
      revenue: yd[q].won.reduce((s, d) => s + d.monetaryValue, 0),
    }));
  }, [byYear, period]);

  const quarterlyWonLostChart = useMemo(() => {
    if (period === "all") {
      const years = Object.keys(byYear)
        .map(Number)
        .sort();
      const data: Array<{ label: string; Won: number; Lost: number }> = [];
      for (const yr of years) {
        for (const q of ["Q1", "Q2", "Q3", "Q4"] as const) {
          const qd = byYear[yr]?.[q];
          if (!qd || (!qd.won.length && !qd.lost.length)) continue;
          data.push({
            label: `${yr} ${q}`,
            Won: qd.won.length,
            Lost: qd.lost.length,
          });
        }
      }
      return data;
    }
    const yr = parseInt(period);
    const yd = byYear[yr];
    if (!yd) return [];
    return (["Q1", "Q2", "Q3", "Q4"] as const).map((q) => ({
      label: q,
      Won: yd[q].won.length,
      Lost: yd[q].lost.length,
    }));
  }, [byYear, period]);

  // Per-year quarter breakdown table
  const quarterTable = useMemo(() => {
    if (period === "all") return null;
    const yr = parseInt(period);
    const yd = byYear[yr];
    if (!yd) return [];
    return (["Q1", "Q2", "Q3", "Q4"] as const)
      .map((q) => {
        const qd = yd[q];
        const rev = qd.won.reduce((s, d) => s + d.monetaryValue, 0);
        const avg = qd.won.length ? rev / qd.won.length : 0;
        const total = qd.won.length + qd.lost.length;
        const rate = total > 0 ? (qd.won.length / total) * 100 : 0;
        const best = [...qd.won].sort(
          (a, b) => b.monetaryValue - a.monetaryValue
        )[0];
        return {
          quarter: QUARTER_LABELS[q],
          won: qd.won.length,
          lost: qd.lost.length,
          closeRate: rate,
          revenue: rev,
          avgFee: avg,
          bestDeal: best
            ? `${best.name.slice(0, 28)} (${formatCurrency(best.monetaryValue)})`
            : "—",
          hasData: qd.won.length > 0 || qd.lost.length > 0,
        };
      })
      .filter((r) => r.hasData);
  }, [byYear, period]);

  // Active pipeline stages for filter pills
  const stageNames = useMemo(() => {
    return [...new Set(active.map((d) => {
      // Look up stage name from pipeline data
      return d.pipelineStageId;
    }))];
  }, [active]);

  const filteredActive = useMemo(() => {
    if (stageFilter === "All") return active;
    return active.filter((d) => d.pipelineStageId === stageFilter);
  }, [active, stageFilter]);

  // Get stage names from disposition pipeline stages (hardcoded from known data)
  const STAGE_NAMES: Record<string, string> = {
    "005f91ef-df6a-4281-9ebc-81db95208591": "New Deal",
    "9a1aeb5a-052b-405e-beec-9ad1733ac366": "Marketing",
    "a8c439c6-b668-4630-aa4f-7fcfe281cff8": "Assigned",
    "827c9a92-1902-4d54-bd44-2f58a8dd9b65": "Set to Close",
    [CLOSED_WON_STAGE]: "Closed Won",
    [CLOSED_LOST_STAGE]: "Closed Lost",
    [DELAYED_STAGE]: "Delayed",
  };

  const getStageName = (id: string) => STAGE_NAMES[id] || id.slice(0, 8);

  // All closed-won deals for the table
  const closedWonDeals = useMemo(() => {
    return [...periodWon].sort(
      (a, b) =>
        new Date(a.lastStatusChangeAt || a.createdAt).getTime() -
        new Date(b.lastStatusChangeAt || b.createdAt).getTime()
    );
  }, [periodWon]);

  const periodLabel =
    period === "all"
      ? "All Time"
      : period === "2026"
        ? "2026 YTD"
        : period;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            CEO Dashboard
          </h1>
          <p className="text-slate-500 mt-1">
            Year &amp; quarter breakdown · {all.length} total deals
          </p>
        </div>
      </div>

      {/* Time period tabs */}
      <div className="flex gap-2 flex-wrap">
        {(
          [
            { id: "all", label: "All Time" },
            { id: "2024", label: "2024" },
            { id: "2025", label: "2025" },
            { id: "2026", label: "2026 YTD" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setPeriod(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
              period === tab.id
                ? "bg-slate-900 text-white border-transparent"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Pipeline Funnel Metrics */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Pipeline Funnel Metrics — {periodLabel}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-lg p-4 border border-slate-100">
            <p className="text-xs text-slate-500 font-medium">
              Net → Gross Lead Ratio
            </p>
            <p className="text-xl font-bold text-blue-600 mt-1">
              {kpis.grossLeads > 0
                ? formatPercent(
                    (kpis.netLeads / kpis.grossLeads) * 100
                  )
                : "—"}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {kpis.netLeads.toLocaleString()} net of{" "}
              {kpis.grossLeads.toLocaleString()} gross
            </p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-slate-100">
            <p className="text-xs text-slate-500 font-medium">
              Contract → Net Lead Ratio
            </p>
            <p className="text-xl font-bold text-slate-900 mt-1">
              {kpis.netLeads > 0
                ? (kpis.contracts / kpis.netLeads).toFixed(2) + "x"
                : "—"}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {kpis.contracts} contracts from{" "}
              {kpis.netLeads.toLocaleString()} net leads
            </p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-slate-100">
            <p className="text-xs text-slate-500 font-medium">
              Contract to Close Rate
            </p>
            <p className="text-xl font-bold text-emerald-600 mt-1">
              {kpis.contracts > 0
                ? formatPercent(
                    (kpis.dealsWon / kpis.contracts) * 100
                  )
                : "—"}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {kpis.dealsWon} closed of {kpis.contracts} contracts
            </p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-slate-100">
            <p className="text-xs text-slate-500 font-medium">
              Avg Revenue / Deal
            </p>
            <p className="text-xl font-bold text-amber-600 mt-1">
              {kpis.dealsWon > 0 ? formatCurrency(kpis.avgFee) : "—"}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              across {kpis.dealsWon} closed won deals
            </p>
          </div>
        </div>
        <p className="text-[10px] text-slate-400 mt-3">
          Gross Leads: {kpis.grossLeads.toLocaleString()} total contacts ·
          Net Leads: {kpis.netLeads.toLocaleString()} contacts with deals ·
          Contracts: {kpis.contracts} deals created ·
          Closed Won: {kpis.dealsWon} deals
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          title="Total Revenue"
          value={formatCurrency(kpis.totalRevenue)}
          subtitle={`${kpis.dealsWon} deals closed`}
          icon={<DollarSign className="w-5 h-5" />}
        />
        <StatCard
          title="Avg Fee / Deal"
          value={kpis.dealsWon > 0 ? formatCurrency(kpis.avgFee) : "—"}
          subtitle={`${kpis.dealsWon} closings`}
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <StatCard
          title="Deals Won"
          value={kpis.dealsWon}
          subtitle="closed won"
          icon={<Trophy className="w-5 h-5" />}
        />
        <StatCard
          title="Deals Lost"
          value={kpis.dealsLost}
          subtitle="closed lost"
          icon={<XCircle className="w-5 h-5" />}
        />
        <StatCard
          title="Close Rate"
          value={formatPercent(kpis.closeRate)}
          subtitle={`${kpis.dealsWon} of ${kpis.dealsWon + kpis.dealsLost}`}
          icon={<Target className="w-5 h-5" />}
        />
        {period !== "all" && parseInt(period) === new Date().getFullYear() && (
          <StatCard
            title="Active Pipeline"
            value={kpis.activePipeline}
            subtitle="deals in progress"
            icon={<BarChart3 className="w-5 h-5" />}
          />
        )}
      </div>

      {/* Annual Comparison Table (show on All Time) */}
      {period === "all" && annualData.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Annual Comparison
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-slate-500 text-left">
                  <th className="px-5 py-3 font-medium">Year</th>
                  <th className="px-5 py-3 font-medium text-right">
                    Deals Won
                  </th>
                  <th className="px-5 py-3 font-medium text-right">
                    Deals Lost
                  </th>
                  <th className="px-5 py-3 font-medium text-right">
                    Close Rate
                  </th>
                  <th className="px-5 py-3 font-medium text-right">Revenue</th>
                  <th className="px-5 py-3 font-medium text-right">Avg Fee</th>
                  <th className="px-5 py-3 font-medium text-right">
                    vs Prior Year
                  </th>
                </tr>
              </thead>
              <tbody>
                {annualData.map((row) => (
                  <tr
                    key={row.year}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-5 py-3 font-medium text-slate-900">
                      {row.year}
                    </td>
                    <td className="px-5 py-3 text-right">{row.won}</td>
                    <td className="px-5 py-3 text-right">{row.lost}</td>
                    <td className="px-5 py-3 text-right">
                      {formatPercent(row.closeRate)}
                    </td>
                    <td className="px-5 py-3 text-right font-medium">
                      {formatCurrency(row.revenue)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {formatCurrency(row.avgFee)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {row.vsPrior === null ? (
                        <span className="text-slate-400">—</span>
                      ) : row.vsPrior >= 0 ? (
                        <span className="text-emerald-600 font-medium">
                          +{row.vsPrior}% ↑
                        </span>
                      ) : (
                        <span className="text-red-500 font-medium">
                          {row.vsPrior}% ↓
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quarter breakdown table (show on per-year views) */}
      {period !== "all" && quarterTable && quarterTable.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {period} by Quarter
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-slate-500 text-left">
                  <th className="px-5 py-3 font-medium">Quarter</th>
                  <th className="px-5 py-3 font-medium text-right">Won</th>
                  <th className="px-5 py-3 font-medium text-right">Lost</th>
                  <th className="px-5 py-3 font-medium text-right">
                    Close Rate
                  </th>
                  <th className="px-5 py-3 font-medium text-right">Revenue</th>
                  <th className="px-5 py-3 font-medium text-right">Avg Fee</th>
                  <th className="px-5 py-3 font-medium">Best Deal</th>
                </tr>
              </thead>
              <tbody>
                {quarterTable.map((row) => (
                  <tr
                    key={row.quarter}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-5 py-3 font-medium text-slate-900">
                      {row.quarter}
                    </td>
                    <td className="px-5 py-3 text-right">{row.won}</td>
                    <td className="px-5 py-3 text-right">{row.lost}</td>
                    <td className="px-5 py-3 text-right">
                      {formatPercent(row.closeRate)}
                    </td>
                    <td className="px-5 py-3 text-right font-medium">
                      {formatCurrency(row.revenue)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {formatCurrency(row.avgFee)}
                    </td>
                    <td className="px-5 py-3 text-slate-600 max-w-[200px] truncate">
                      {row.bestDeal}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Revenue by Quarter
          </h3>
          {quarterlyRevChart.length > 0 ? (
            <StackedBarChart
              data={quarterlyRevChart}
              xKey="label"
              bars={[{ key: "revenue", color: "#3b82f6", label: "Revenue" }]}
              isCurrency
              height={220}
            />
          ) : (
            <p className="text-sm text-slate-400 py-8 text-center">
              No revenue data for this period
            </p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Deals Won vs Lost by Quarter
          </h3>
          {quarterlyWonLostChart.length > 0 ? (
            <StackedBarChart
              data={quarterlyWonLostChart}
              xKey="label"
              bars={[
                { key: "Won", color: "#10b981", label: "Won" },
                { key: "Lost", color: "#ef4444", label: "Lost" },
              ]}
              height={220}
            />
          ) : (
            <p className="text-sm text-slate-400 py-8 text-center">
              No deal data for this period
            </p>
          )}
        </div>
      </div>

      {/* Active Pipeline with stage filter pills (show on current year) */}
      {active.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Active Pipeline — {active.length} deals in progress
            </h3>
          </div>
          <div className="px-5 pt-4 pb-2 flex gap-2 flex-wrap">
            <button
              onClick={() => setStageFilter("All")}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                stageFilter === "All"
                  ? "bg-slate-900 text-white border-transparent"
                  : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
              }`}
            >
              All ({active.length})
            </button>
            {[...new Set(active.map((d) => d.pipelineStageId))].map(
              (stageId) => {
                const count = active.filter(
                  (d) => d.pipelineStageId === stageId
                ).length;
                return (
                  <button
                    key={stageId}
                    onClick={() => setStageFilter(stageId)}
                    className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                      stageFilter === stageId
                        ? "bg-slate-900 text-white border-transparent"
                        : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {getStageName(stageId)} ({count})
                  </button>
                );
              }
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-slate-500 text-left">
                  <th className="px-5 py-3 font-medium">Property</th>
                  <th className="px-5 py-3 font-medium">Stage</th>
                  <th className="px-5 py-3 font-medium text-right">Value</th>
                  <th className="px-5 py-3 font-medium">Assigned To</th>
                  <th className="px-5 py-3 font-medium">Contact</th>
                </tr>
              </thead>
              <tbody>
                {filteredActive.map((d) => (
                  <tr
                    key={d.id}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-5 py-3 font-medium text-slate-900 max-w-[250px] truncate">
                      {d.name || "—"}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {getStageName(d.pipelineStageId)}
                    </td>
                    <td className="px-5 py-3 text-right font-medium">
                      {d.monetaryValue > 0
                        ? formatCurrency(d.monetaryValue)
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {d.assignedTo
                        ? USERS[d.assignedTo] ?? "Unknown"
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {d.contact?.name || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* All Closed-Won Deals table */}
      {closedWonDeals.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {periodLabel} — All Closed-Won Deals ({closedWonDeals.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-slate-500 text-left">
                  <th className="px-5 py-3 font-medium">Property</th>
                  {period === "all" && (
                    <th className="px-5 py-3 font-medium">Quarter</th>
                  )}
                  <th className="px-5 py-3 font-medium text-right">Fee</th>
                  <th className="px-5 py-3 font-medium">Assigned To</th>
                  <th className="px-5 py-3 font-medium">Contact</th>
                </tr>
              </thead>
              <tbody>
                {closedWonDeals.map((d) => {
                  const date = d.lastStatusChangeAt || d.createdAt;
                  const { year, quarter } = date
                    ? getYearQuarter(date)
                    : { year: 0, quarter: 0 };
                  return (
                    <tr
                      key={d.id}
                      className="border-t border-slate-100 hover:bg-slate-50"
                    >
                      <td className="px-5 py-3 font-medium text-slate-900 max-w-[250px] truncate">
                        {d.name || "—"}
                      </td>
                      {period === "all" && (
                        <td className="px-5 py-3 text-slate-600">
                          {year} Q{quarter}
                        </td>
                      )}
                      <td className="px-5 py-3 text-right font-medium text-emerald-600">
                        {d.monetaryValue > 0
                          ? formatCurrency(d.monetaryValue)
                          : "—"}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {d.assignedTo
                          ? USERS[d.assignedTo] ?? "Unknown"
                          : "—"}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {d.contact?.name || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
