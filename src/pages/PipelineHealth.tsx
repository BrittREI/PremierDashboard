import { useMemo } from "react";
import { FunnelChart } from "@/components/charts/FunnelChart";
import { useAllOpportunities, usePipelines } from "@/hooks/useGhlData";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { StageCount, Pipeline, Opportunity } from "@/types/ghl";
import { PIPELINES } from "@/types/ghl";

function buildStageCounts(
  pipeline: Pipeline | undefined,
  opps: Opportunity[]
): StageCount[] {
  if (!pipeline) return [];
  return pipeline.stages.map((stage) => {
    const stageOpps = opps.filter((o) => o.pipelineStageId === stage.id);
    return {
      stageId: stage.id,
      stageName: stage.name,
      count: stageOpps.length,
      totalValue: stageOpps.reduce((s, o) => s + o.monetaryValue, 0),
      position: stage.position,
    };
  });
}

function PipelineCard({
  title,
  stages,
  totalOpps,
  totalValue,
}: {
  title: string;
  stages: StageCount[];
  totalOpps: number;
  totalValue: number;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
        <div className="flex gap-4 text-sm text-slate-500">
          <span>
            <strong className="text-slate-800">{formatNumber(totalOpps)}</strong>{" "}
            deals
          </span>
          <span>
            <strong className="text-slate-800">
              {formatCurrency(totalValue)}
            </strong>{" "}
            value
          </span>
        </div>
      </div>
      {totalOpps > 0 ? (
        <FunnelChart data={stages} showValue />
      ) : (
        <div className="h-40 flex items-center justify-center text-slate-400 text-sm">
          No opportunities in this pipeline
        </div>
      )}

      {/* Stage detail table */}
      {totalOpps > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 text-left">
                <th className="pb-2 font-medium">Stage</th>
                <th className="pb-2 font-medium text-right">Count</th>
                <th className="pb-2 font-medium text-right">Value</th>
                <th className="pb-2 font-medium text-right">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {stages
                .filter((s) => s.count > 0)
                .sort((a, b) => a.position - b.position)
                .map((s) => (
                  <tr
                    key={s.stageId}
                    className="border-t border-slate-50 text-slate-700"
                  >
                    <td className="py-2">{s.stageName}</td>
                    <td className="py-2 text-right font-medium">{s.count}</td>
                    <td className="py-2 text-right">
                      {formatCurrency(s.totalValue)}
                    </td>
                    <td className="py-2 text-right text-slate-500">
                      {totalOpps > 0
                        ? Math.round((s.count / totalOpps) * 100)
                        : 0}
                      %
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function PipelineHealth() {
  const { data: pipelines, isLoading: pLoading } = usePipelines();
  const { leadManagement, acquisitions, disposition, isLoading: oLoading } =
    useAllOpportunities();

  const isLoading = pLoading || oLoading;

  const leadPipeline = pipelines?.find(
    (p) => p.id === PIPELINES.leadManagement.id
  );
  const acqPipeline = pipelines?.find(
    (p) => p.id === PIPELINES.acquisitions.id
  );
  const dispPipeline = pipelines?.find(
    (p) => p.id === PIPELINES.disposition.id
  );

  const leadStages = useMemo(
    () => buildStageCounts(leadPipeline, leadManagement),
    [leadPipeline, leadManagement]
  );
  const acqStages = useMemo(
    () => buildStageCounts(acqPipeline, acquisitions),
    [acqPipeline, acquisitions]
  );
  const dispStages = useMemo(
    () => buildStageCounts(dispPipeline, disposition),
    [dispPipeline, disposition]
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
        <h1 className="text-2xl font-bold text-slate-900">Pipeline Health</h1>
        <p className="text-slate-500 mt-1">
          Stage-by-stage breakdown across all active pipelines
        </p>
      </div>

      <PipelineCard
        title="Lead Management"
        stages={leadStages}
        totalOpps={leadManagement.length}
        totalValue={leadManagement.reduce((s, o) => s + o.monetaryValue, 0)}
      />

      <PipelineCard
        title="Acquisitions"
        stages={acqStages}
        totalOpps={acquisitions.length}
        totalValue={acquisitions.reduce((s, o) => s + o.monetaryValue, 0)}
      />

      <PipelineCard
        title="Disposition"
        stages={dispStages}
        totalOpps={disposition.length}
        totalValue={disposition.reduce((s, o) => s + o.monetaryValue, 0)}
      />
    </div>
  );
}
