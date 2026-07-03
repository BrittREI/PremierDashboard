import { useMemo, useState } from "react";
import {
  Target,
  Send,
  XCircle,
  FileText,
  Percent,
  UserCheck,
  Trophy,
  DollarSign,
  TrendingUp,
  Clock,
  Layers,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { useAllOpportunities, usePipelines } from "@/hooks/useGhlData";
import { formatCurrency, formatPercent } from "@/lib/utils";
import {
  buildStageMap,
  getDealRevenue,
  getContractDate,
  getCloseDate,
  USERS,
  type Opportunity,
} from "@/types/ghl";

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

function isInMonth(dateStr: string, start: Date, end: Date): boolean {
  const d = new Date(dateStr);
  return d >= start && d < end;
}

const STAGE_PATTERNS = {
  offerSent: /offer\s*sent/i,
  underContract: /under\s*contract/i,
  notQualified: /not\s*qualified/i,
  dnc: /^dnc$/i,
  assigned: /^assigned$/i,
  setToClose: /set\s*to\s*close/i,
  closedWon: /closed\s*won/i,
  closedLost: /closed\s*lost/i,
  newLead: /new\s*(lead|deal)/i,
  working: /^working$/i,
};

function matchStage(
  opp: Opportunity,
  stageMap: Record<string, string>,
  pattern: RegExp
): boolean {
  const name = stageMap[opp.pipelineStageId] ?? "";
  return pattern.test(name);
}

function stagePosition(
  opp: Opportunity,
  stageMap: Record<string, string>,
  pipelineStages: Array<{ id: string; name: string; position: number }>
): number {
  const stage = pipelineStages.find((s) => s.id === opp.pipelineStageId);
  return stage?.position ?? -1;
}

export function TeamDashboard() {
  const [monthOffset, setMonthOffset] = useState(0);
  const { leadManagement, acquisitions, disposition, allDeals, isLoading } =
    useAllOpportunities();
  const pipelinesQuery = usePipelines();

  const stageMap = useMemo(
    () => buildStageMap(pipelinesQuery.data ?? []),
    [pipelinesQuery.data]
  );

  const acqPipeline = useMemo(
    () => pipelinesQuery.data?.find((p) => p.name === "Acquisitions"),
    [pipelinesQuery.data]
  );

  const { start: monthStart, end: monthEnd } = getMonthRange(monthOffset);

  const kpis = useMemo(() => {
    // 1. Leads for the month (Lead Management pipeline, created this month)
    const leadsThisMonth = leadManagement.filter((o) =>
      isInMonth(o.createdAt, monthStart, monthEnd)
    );

    // 2. Offers made (Acquisitions opps that reached Offer Sent or beyond this month)
    const acqStages = acqPipeline?.stages ?? [];
    const offerSentPos =
      acqStages.find((s) => STAGE_PATTERNS.offerSent.test(s.name))?.position ??
      2;
    const offersThisMonth = acquisitions.filter((o) => {
      const pos = stagePosition(o, stageMap, acqStages);
      if (pos < offerSentPos) return false;
      return (
        isInMonth(o.lastStageChangeAt, monthStart, monthEnd) ||
        isInMonth(o.createdAt, monthStart, monthEnd)
      );
    });

    // 3. Disqualified leads (Lead Management Not Qualified + DNC this month)
    const disqualifiedThisMonth = leadManagement.filter((o) => {
      const isDisq =
        matchStage(o, stageMap, STAGE_PATTERNS.notQualified) ||
        matchStage(o, stageMap, STAGE_PATTERNS.dnc);
      if (!isDisq) return false;
      return (
        isInMonth(o.lastStageChangeAt, monthStart, monthEnd) ||
        isInMonth(o.createdAt, monthStart, monthEnd)
      );
    });

    // 4. Contracts for the month (Acquisitions Under Contract this month)
    const contractsThisMonth = acquisitions.filter((o) => {
      const isContract =
        matchStage(o, stageMap, STAGE_PATTERNS.underContract) ||
        o.status === "won";
      if (!isContract) return false;
      return (
        isInMonth(o.lastStageChangeAt, monthStart, monthEnd) ||
        isInMonth(o.lastStatusChangeAt, monthStart, monthEnd)
      );
    });

    // 5. Offers to contract ratio
    const offersToContract =
      contractsThisMonth.length > 0
        ? offersThisMonth.length / contractsThisMonth.length
        : 0;

    // 6. Deals assigned (Disposition Assigned stage this month)
    const dealsAssignedThisMonth = disposition.filter((o) => {
      const pos = stagePosition(
        o,
        stageMap,
        pipelinesQuery.data?.find((p) => p.name === "Disposition")?.stages ?? []
      );
      const assignedPos =
        pipelinesQuery.data
          ?.find((p) => p.name === "Disposition")
          ?.stages.find((s) => STAGE_PATTERNS.assigned.test(s.name))
          ?.position ?? 2;
      if (pos < assignedPos) return false;
      return (
        isInMonth(o.lastStageChangeAt, monthStart, monthEnd) ||
        isInMonth(o.createdAt, monthStart, monthEnd)
      );
    });

    // 7. Deals closed & value (Disposition Closed Won this month)
    const closedWonThisMonth = allDeals.filter((o) => {
      const isWon =
        matchStage(o, stageMap, STAGE_PATTERNS.closedWon) ||
        o.status === "won";
      if (!isWon) return false;
      return isInMonth(
        o.lastStatusChangeAt || o.lastStageChangeAt,
        monthStart,
        monthEnd
      );
    });
    const closedWonValue = closedWonThisMonth.reduce(
      (sum, o) => sum + getDealRevenue(o),
      0
    );

    // 8. Average assignment fee per closed deal
    const avgAssignmentFee = closedWonThisMonth.length
      ? closedWonValue / closedWonThisMonth.length
      : 0;

    // 9. Lead to contract conversion rate
    const leadToContract =
      leadsThisMonth.length > 0
        ? (contractsThisMonth.length / leadsThisMonth.length) * 100
        : 0;

    // 10. Avg days to close once under contract
    const daysUnderContract: number[] = [];
    for (const o of closedWonThisMonth) {
      const contractDate = getContractDate(o);
      const closeDate =
        getCloseDate(o) || new Date(o.lastStatusChangeAt || o.updatedAt);
      if (contractDate && closeDate) {
        const days = Math.round(
          (closeDate.getTime() - contractDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (days >= 0 && days < 365) daysUnderContract.push(days);
      }
    }
    const avgDaysUnderContract = daysUnderContract.length
      ? Math.round(
          daysUnderContract.reduce((a, b) => a + b, 0) /
            daysUnderContract.length
        )
      : null;

    // 11. Avg days from lead entry to close
    const daysFromEntry: number[] = [];
    for (const o of closedWonThisMonth) {
      const closeDate =
        getCloseDate(o) || new Date(o.lastStatusChangeAt || o.updatedAt);
      const entryDate = new Date(o.createdAt);
      if (closeDate && entryDate) {
        const days = Math.round(
          (closeDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (days >= 0 && days < 730) daysFromEntry.push(days);
      }
    }
    const avgDaysFromEntry = daysFromEntry.length
      ? Math.round(
          daysFromEntry.reduce((a, b) => a + b, 0) / daysFromEntry.length
        )
      : null;

    // 12. Total contracts in pipeline (all open Under Contract, regardless of month)
    const totalContractsInPipeline = acquisitions.filter(
      (o) =>
        matchStage(o, stageMap, STAGE_PATTERNS.underContract) &&
        o.status === "open"
    ).length;

    return {
      leads: leadsThisMonth.length,
      offers: offersThisMonth.length,
      disqualified: disqualifiedThisMonth.length,
      contracts: contractsThisMonth.length,
      offersToContract,
      dealsAssigned: dealsAssignedThisMonth.length,
      closedWon: closedWonThisMonth.length,
      closedWonValue,
      avgAssignmentFee,
      leadToContract,
      avgDaysUnderContract,
      avgDaysFromEntry,
      totalContractsInPipeline,
      closedWonDeals: closedWonThisMonth,
    };
  }, [
    leadManagement,
    acquisitions,
    disposition,
    allDeals,
    stageMap,
    acqPipeline,
    pipelinesQuery.data,
    monthStart,
    monthEnd,
  ]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with month navigation */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team Dashboard</h1>
          <p className="text-slate-500 mt-1">
            Monthly KPIs — {formatMonthLabel(monthOffset)}
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

      {/* Bold KPIs — primary metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Leads"
          value={kpis.leads}
          subtitle="new leads this month"
          icon={<Target className="w-5 h-5" />}
          className="ring-2 ring-blue-100"
        />
        <StatCard
          title="Offers Made"
          value={kpis.offers}
          subtitle="offers sent this month"
          icon={<Send className="w-5 h-5" />}
          className="ring-2 ring-blue-100"
        />
        <StatCard
          title="Contracts"
          value={kpis.contracts}
          subtitle="under contract this month"
          icon={<FileText className="w-5 h-5" />}
          className="ring-2 ring-blue-100"
        />
        <StatCard
          title="Deals Closed"
          value={`${kpis.closedWon} · ${formatCurrency(kpis.closedWonValue)}`}
          subtitle="closed won & profit"
          icon={<Trophy className="w-5 h-5" />}
          className="ring-2 ring-emerald-100"
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <MetricBox
          label="Disqualified Leads"
          value={String(kpis.disqualified)}
          icon={<XCircle className="w-4 h-4 text-red-500" />}
        />
        <MetricBox
          label="Offers : Contract Ratio"
          value={
            kpis.contracts > 0
              ? `${kpis.offersToContract.toFixed(1)} : 1`
              : "—"
          }
          icon={<Percent className="w-4 h-4 text-amber-500" />}
        />
        <MetricBox
          label="Deals Assigned"
          value={String(kpis.dealsAssigned)}
          sublabel="buyer in place"
          icon={<UserCheck className="w-4 h-4 text-purple-500" />}
        />
        <MetricBox
          label="Avg Assignment Fee"
          value={
            kpis.closedWon > 0 ? formatCurrency(kpis.avgAssignmentFee) : "—"
          }
          sublabel="per closed deal"
          icon={<DollarSign className="w-4 h-4 text-emerald-500" />}
        />
        <MetricBox
          label="Lead → Contract"
          value={kpis.leads > 0 ? formatPercent(kpis.leadToContract) : "—"}
          sublabel="conversion rate"
          icon={<TrendingUp className="w-4 h-4 text-blue-500" />}
        />
        <MetricBox
          label="Avg Days to Close"
          value={
            kpis.avgDaysUnderContract !== null
              ? `${kpis.avgDaysUnderContract}d`
              : "—"
          }
          sublabel="once under contract"
          icon={<Clock className="w-4 h-4 text-orange-500" />}
        />
        <MetricBox
          label="Avg Days Lead → Close"
          value={
            kpis.avgDaysFromEntry !== null ? `${kpis.avgDaysFromEntry}d` : "—"
          }
          sublabel="from lead entry"
          icon={<Clock className="w-4 h-4 text-slate-500" />}
        />
        <MetricBox
          label="Contracts in Pipeline"
          value={String(kpis.totalContractsInPipeline)}
          sublabel="total active"
          icon={<Layers className="w-4 h-4 text-indigo-500" />}
        />
      </div>

      {/* Closed Won deals table */}
      {kpis.closedWonDeals.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Deals Closed — {formatMonthLabel(monthOffset)} (
              {kpis.closedWonDeals.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-slate-500 text-left">
                  <th className="px-5 py-3 font-medium">Property</th>
                  <th className="px-5 py-3 font-medium">Contact</th>
                  <th className="px-5 py-3 font-medium text-right">Profit</th>
                  <th className="px-5 py-3 font-medium">Assigned To</th>
                </tr>
              </thead>
              <tbody>
                {kpis.closedWonDeals.map((d) => (
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
                    <td className="px-5 py-3 text-right font-medium text-emerald-600">
                      {getDealRevenue(d) > 0
                        ? formatCurrency(getDealRevenue(d))
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {d.assignedTo ? USERS[d.assignedTo] ?? "Unknown" : "—"}
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

function MetricBox({
  label,
  value,
  sublabel,
  icon,
}: {
  label: string;
  value: string;
  sublabel?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <p className="text-xs font-medium text-slate-500">{label}</p>
      </div>
      <p className="text-xl font-bold text-slate-900">{value}</p>
      {sublabel && <p className="text-xs text-slate-400 mt-0.5">{sublabel}</p>}
    </div>
  );
}
