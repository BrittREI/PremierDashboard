import { useMemo, useState, useCallback } from "react";
import {
  DollarSign,
  TrendingDown,
  Megaphone,
  Users,
  Target,
  XCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { StackedBarChart } from "@/components/charts/StackedBarChart";
import { useAllOpportunities, usePipelines } from "@/hooks/useGhlData";
import { formatCurrency, formatPercent } from "@/lib/utils";
import {
  buildStageMap,
  getDealRevenue,
  USERS as USER_MAP,
  type Opportunity,
} from "@/types/ghl";

const CLOSED_WON_PATTERN = /closed\s*won/i;
const CLOSED_LOST_PATTERN = /closed\s*lost/i;
const UNDER_CONTRACT_PATTERN = /under\s*contract/i;

function getMonthRange(offset: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { start, end };
}

function formatMonthLabel(offset: number): string {
  const { start } = getMonthRange(offset);
  return start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function storageKey(monthOffset: number, field: string): string {
  const { start } = getMonthRange(monthOffset);
  const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
  return `ppp-ceo-${key}-${field}`;
}

function isInMonth(dateStr: string, start: Date, end: Date): boolean {
  const d = new Date(dateStr);
  return d >= start && d < end;
}

function useCeoInput(monthOffset: number, field: string) {
  const key = storageKey(monthOffset, field);
  const [value, setValueState] = useState(() => {
    const stored = localStorage.getItem(key);
    return stored ? parseFloat(stored) : 0;
  });

  const setValue = useCallback(
    (v: number) => {
      setValueState(v);
      localStorage.setItem(key, String(v));
    },
    [key]
  );

  return [value, setValue] as const;
}

export function CeoDashboard() {
  const [monthOffset, setMonthOffset] = useState(0);
  const { leadManagement, acquisitions, allDeals, isLoading } =
    useAllOpportunities();
  const pipelinesQuery = usePipelines();

  const stageMap = useMemo(
    () => buildStageMap(pipelinesQuery.data ?? []),
    [pipelinesQuery.data]
  );

  const { start: monthStart, end: monthEnd } = getMonthRange(monthOffset);

  const [adSpend, setAdSpend] = useCeoInput(monthOffset, "adSpend");
  const [teamPayment, setTeamPayment] = useCeoInput(
    monthOffset,
    "teamPayment"
  );

  const kpis = useMemo(() => {
    // Leads for the month (Lead Management created this month)
    const leadsThisMonth = leadManagement.filter((o) =>
      isInMonth(o.createdAt, monthStart, monthEnd)
    );

    // Closed Won this month (across all deal pipelines)
    const closedWonThisMonth = allDeals.filter((o) => {
      const name = stageMap[o.pipelineStageId] ?? "";
      const isWon = CLOSED_WON_PATTERN.test(name) || o.status === "won";
      if (!isWon) return false;
      return isInMonth(
        o.lastStatusChangeAt || o.lastStageChangeAt,
        monthStart,
        monthEnd
      );
    });
    const grossRevenue = closedWonThisMonth.reduce(
      (sum, o) => sum + getDealRevenue(o),
      0
    );

    // Net revenue
    const netRevenue = grossRevenue - adSpend - teamPayment;

    // Cost per lead
    const costPerLead =
      leadsThisMonth.length > 0 ? adSpend / leadsThisMonth.length : 0;

    // Contract to close fallout: deals that were Under Contract but ended up Closed Lost this month
    const contractsUnderContract = acquisitions.filter((o) => {
      const name = stageMap[o.pipelineStageId] ?? "";
      return (
        UNDER_CONTRACT_PATTERN.test(name) ||
        o.status === "won" ||
        CLOSED_LOST_PATTERN.test(name)
      );
    });
    const falloutThisMonth = allDeals.filter((o) => {
      const name = stageMap[o.pipelineStageId] ?? "";
      const isLost = CLOSED_LOST_PATTERN.test(name) || o.status === "lost";
      if (!isLost) return false;
      return isInMonth(
        o.lastStatusChangeAt || o.lastStageChangeAt,
        monthStart,
        monthEnd
      );
    });
    const totalContractDecisions =
      closedWonThisMonth.length + falloutThisMonth.length;
    const falloutRate =
      totalContractDecisions > 0
        ? (falloutThisMonth.length / totalContractDecisions) * 100
        : 0;

    return {
      leads: leadsThisMonth.length,
      grossRevenue,
      netRevenue,
      costPerLead,
      closedWon: closedWonThisMonth.length,
      fallout: falloutThisMonth.length,
      falloutRate,
      closedWonDeals: closedWonThisMonth,
      falloutDeals: falloutThisMonth,
    };
  }, [
    leadManagement,
    acquisitions,
    allDeals,
    stageMap,
    monthStart,
    monthEnd,
    adSpend,
    teamPayment,
  ]);

  // Monthly revenue trend (last 6 months)
  const monthlyTrend = useMemo(() => {
    const data: Array<{ label: string; Revenue: number; "Net Revenue": number }> = [];
    for (let i = -5; i <= 0; i++) {
      const adjOffset = monthOffset + i;
      const { start, end } = getMonthRange(adjOffset);
      const label = start.toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
      });
      const monthWon = allDeals.filter((o) => {
        const name = stageMap[o.pipelineStageId] ?? "";
        const isWon = CLOSED_WON_PATTERN.test(name) || o.status === "won";
        if (!isWon) return false;
        return isInMonth(
          o.lastStatusChangeAt || o.lastStageChangeAt,
          start,
          end
        );
      });
      const rev = monthWon.reduce((s, o) => s + getDealRevenue(o), 0);
      const spendKey = storageKey(adjOffset, "adSpend");
      const payKey = storageKey(adjOffset, "teamPayment");
      const spend = parseFloat(localStorage.getItem(spendKey) ?? "0");
      const pay = parseFloat(localStorage.getItem(payKey) ?? "0");
      data.push({ label, Revenue: rev, "Net Revenue": rev - spend - pay });
    }
    return data;
  }, [allDeals, stageMap, monthOffset]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">CEO Dashboard</h1>
          <p className="text-slate-500 mt-1">
            Financial KPIs — {formatMonthLabel(monthOffset)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonthOffset((o) => o - 1)}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMonthOffset(0)}
            className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            This Month
          </button>
          <button
            onClick={() => setMonthOffset((o) => Math.min(o + 1, 0))}
            disabled={monthOffset >= 0}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Manual inputs */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Monthly Expenses (editable)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Ad / Marketing Spend
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                $
              </span>
              <input
                type="number"
                value={adSpend || ""}
                onChange={(e) => setAdSpend(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Payment to Team
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                $
              </span>
              <input
                type="number"
                value={teamPayment || ""}
                onChange={(e) => setTeamPayment(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bold KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          title="Gross Revenue"
          value={formatCurrency(kpis.grossRevenue)}
          subtitle={`${kpis.closedWon} deals closed`}
          icon={<DollarSign className="w-5 h-5" />}
          className="ring-2 ring-emerald-100"
        />
        <StatCard
          title="Net Revenue"
          value={formatCurrency(kpis.netRevenue)}
          subtitle="after spend & team payment"
          icon={<TrendingDown className="w-5 h-5" />}
          className={`ring-2 ${kpis.netRevenue >= 0 ? "ring-emerald-100" : "ring-red-100"}`}
        />
        <StatCard
          title="Ad Spend"
          value={formatCurrency(adSpend)}
          subtitle="marketing this month"
          icon={<Megaphone className="w-5 h-5" />}
          className="ring-2 ring-blue-100"
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-purple-500" />
            <p className="text-xs font-medium text-slate-500">Team Payment</p>
          </div>
          <p className="text-xl font-bold text-slate-900">
            {formatCurrency(teamPayment)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-blue-500" />
            <p className="text-xs font-medium text-slate-500">Cost per Lead</p>
          </div>
          <p className="text-xl font-bold text-slate-900">
            {kpis.leads > 0 && adSpend > 0
              ? formatCurrency(kpis.costPerLead)
              : "—"}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {kpis.leads} leads this month
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="w-4 h-4 text-red-500" />
            <p className="text-xs font-medium text-slate-500">
              Fallout (Lost After Contract)
            </p>
          </div>
          <p className="text-xl font-bold text-slate-900">{kpis.fallout}</p>
          <p className="text-xs text-slate-400 mt-0.5">deals cancelled/lost</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-amber-500" />
            <p className="text-xs font-medium text-slate-500">Fallout Rate</p>
          </div>
          <p className="text-xl font-bold text-slate-900">
            {kpis.fallout > 0 || kpis.closedWon > 0
              ? formatPercent(kpis.falloutRate)
              : "—"}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {kpis.fallout} lost of {kpis.closedWon + kpis.fallout} decided
          </p>
        </div>
      </div>

      {/* Revenue trend chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
          6-Month Revenue Trend
        </h3>
        {monthlyTrend.some((d) => d.Revenue > 0) ? (
          <StackedBarChart
            data={monthlyTrend}
            xKey="label"
            bars={[
              { key: "Revenue", color: "#10b981", label: "Gross Revenue" },
              { key: "Net Revenue", color: "#3b82f6", label: "Net Revenue" },
            ]}
            isCurrency
            height={250}
          />
        ) : (
          <p className="text-sm text-slate-400 py-8 text-center">
            No revenue data for this period
          </p>
        )}
      </div>

      {/* Fallout deals table */}
      {kpis.falloutDeals.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Deals Lost / Cancelled — {formatMonthLabel(monthOffset)} (
              {kpis.falloutDeals.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-slate-500 text-left">
                  <th className="px-5 py-3 font-medium">Property</th>
                  <th className="px-5 py-3 font-medium">Contact</th>
                  <th className="px-5 py-3 font-medium text-right">Value</th>
                  <th className="px-5 py-3 font-medium">Assigned To</th>
                </tr>
              </thead>
              <tbody>
                {kpis.falloutDeals.map((d) => (
                  <tr
                    key={d.id}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-5 py-3 font-medium text-slate-900 max-w-[250px] truncate">
                      {d.name || "—"}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {d.contact?.name || "—"}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-red-500">
                      {getDealRevenue(d) > 0
                        ? formatCurrency(getDealRevenue(d))
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {d.assignedTo
                        ? USER_MAP[d.assignedTo] ?? "Unknown"
                        : "—"}
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
