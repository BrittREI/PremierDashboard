import { useMemo } from "react";
import { Target, Zap } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { DonutChart } from "@/components/charts/DonutChart";
import { BarChartHorizontal } from "@/components/charts/BarChartHorizontal";
import { useAllOpportunities } from "@/hooks/useGhlData";
import { formatCurrency, formatPercent, getLeadSource } from "@/lib/utils";
import type { LeadSourceMetrics, Opportunity } from "@/types/ghl";

function buildSourceMetrics(opps: Opportunity[]): LeadSourceMetrics[] {
  const map = new Map<string, LeadSourceMetrics>();

  for (const opp of opps) {
    const src = getLeadSource(opp);
    let m = map.get(src);
    if (!m) {
      m = { source: src, count: 0, converted: 0, conversionRate: 0, totalValue: 0 };
      map.set(src, m);
    }
    m.count++;
    m.totalValue += opp.monetaryValue;

    // Count as "converted" if in Disposition pipeline with Closed Won stage
    if (opp.pipelineStageId === "3e83fed8-a5cb-4b27-b1f9-4277cc7642ef") {
      m.converted++;
    }
  }

  for (const m of map.values()) {
    m.conversionRate = m.count > 0 ? (m.converted / m.count) * 100 : 0;
  }

  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

export function LeadSources() {
  const { all, isLoading } = useAllOpportunities();

  const metrics = useMemo(() => buildSourceMetrics(all), [all]);
  const totalSources = metrics.length;
  const topSource = metrics[0];

  // Chart data
  const countData = useMemo(
    () => metrics.map((m) => ({ name: m.source, value: m.count })),
    [metrics]
  );

  const valueData = useMemo(
    () =>
      metrics
        .filter((m) => m.totalValue > 0)
        .map((m) => ({ name: m.source, value: m.totalValue })),
    [metrics]
  );

  const donutData = useMemo(
    () => metrics.slice(0, 6).map((m) => ({ name: m.source, value: m.count })),
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
        <h1 className="text-2xl font-bold text-slate-900">Lead Sources</h1>
        <p className="text-slate-500 mt-1">
          Where your leads and deals originate
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Total Sources"
          value={totalSources}
          subtitle="Unique lead channels"
          icon={<Target className="w-5 h-5" />}
        />
        <StatCard
          title="Top Source"
          value={topSource?.source ?? "—"}
          subtitle={`${topSource?.count ?? 0} leads`}
          icon={<Zap className="w-5 h-5" />}
        />
        <StatCard
          title="Total Value"
          value={formatCurrency(
            metrics.reduce((s, m) => s + m.totalValue, 0)
          )}
          subtitle="All sources combined"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">
            Lead Distribution by Source
          </h3>
          <DonutChart
            data={donutData}
            centerLabel="Sources"
            centerValue={String(totalSources)}
          />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">
            Leads by Source
          </h3>
          <BarChartHorizontal data={countData} color="#f59e0b" />
        </div>
      </div>

      {valueData.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">
            Deal Value by Source
          </h3>
          <BarChartHorizontal data={valueData} isCurrency color="#10b981" />
        </div>
      )}

      {/* Source detail table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">
            Source Breakdown
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-slate-500 text-left">
                <th className="px-6 py-3 font-medium">Source</th>
                <th className="px-6 py-3 font-medium text-right">Leads</th>
                <th className="px-6 py-3 font-medium text-right">
                  Closed Won
                </th>
                <th className="px-6 py-3 font-medium text-right">
                  Conversion
                </th>
                <th className="px-6 py-3 font-medium text-right">
                  Total Value
                </th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr
                  key={m.source}
                  className="border-t border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-6 py-3 font-medium text-slate-900">
                    {m.source}
                  </td>
                  <td className="px-6 py-3 text-right">{m.count}</td>
                  <td className="px-6 py-3 text-right text-emerald-600 font-medium">
                    {m.converted}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {formatPercent(m.conversionRate)}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {formatCurrency(m.totalValue)}
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
