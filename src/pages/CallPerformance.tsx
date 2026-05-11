import { useMemo } from "react";
import {
  Phone,
  PhoneIncoming,
  PhoneOff,
  PhoneOutgoing,
  CheckCircle,
  BarChart3,
} from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { StackedBarChart } from "@/components/charts/StackedBarChart";
import { useCallStats } from "@/hooks/useGhlData";
import { formatPercent } from "@/lib/utils";

const CHANNEL_LABELS: Record<string, string> = {
  TYPE_CALL: "Calls",
  TYPE_SMS: "SMS",
  TYPE_EMAIL: "Email",
  TYPE_FB_MESSENGER: "Facebook",
  TYPE_INSTAGRAM: "Instagram",
  TYPE_NO_SHOW: "No Show",
  TYPE_ACTIVITY: "Activity",
  TYPE_LIVE_CHAT: "Live Chat",
  TYPE_WHATSAPP: "WhatsApp",
};

function rateColor(rate: number) {
  if (rate >= 0.8) return "text-emerald-600 bg-emerald-50";
  if (rate >= 0.6) return "text-amber-600 bg-amber-50";
  return "text-red-600 bg-red-50";
}

export function CallPerformance() {
  const { data, isLoading, error } = useCallStats();

  const trendChartData = useMemo(() => {
    if (!data?.trend) return [];
    return data.trend.map((d) => {
      const dt = new Date(d.date + "T12:00:00");
      return {
        label: dt.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        Answered: d.inbound - d.missed,
        Missed: d.missed,
      };
    });
  }, [data]);

  const channelTotal = useMemo(() => {
    if (!data?.channelMix) return 0;
    return data.channelMix.reduce((s, c) => s + c.count, 0);
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 flex-col gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        <p className="text-sm text-slate-500">
          Fetching call data from Go High Level…
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">
        Failed to load call data:{" "}
        {error instanceof Error ? error.message : "Unknown error"}
      </div>
    );
  }

  const { calls, byUser, channelMix } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Lead Management KPIs
        </h1>
        <p className="text-slate-500 mt-1">
          {data.window.conversations.toLocaleString()} conversations
          tracked (last {data.window.days} days) · Updated{" "}
          {new Date(data.fetchedAt).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      </div>

      {/* Inbound Call Performance KPIs */}
      <div>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 pb-2 border-b border-slate-200">
          Inbound Call Performance
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            title="Inbound Calls"
            value={calls.inbound.toLocaleString()}
            subtitle="last 90 days"
            icon={<PhoneIncoming className="w-5 h-5" />}
          />
          <StatCard
            title="Answered"
            value={calls.answered.toLocaleString()}
            subtitle={`${formatPercent(
              calls.inbound > 0
                ? (calls.answered / calls.inbound) * 100
                : 0
            )} answer rate`}
            icon={<CheckCircle className="w-5 h-5" />}
          />
          <StatCard
            title="Missed"
            value={calls.missed.toLocaleString()}
            subtitle="includes voicemails"
            icon={<PhoneOff className="w-5 h-5" />}
          />
          <StatCard
            title="Answer Rate"
            value={formatPercent(calls.answerRate * 100)}
            subtitle="inbound calls"
            icon={<BarChart3 className="w-5 h-5" />}
          />
          <StatCard
            title="Outbound Calls"
            value={calls.outbound.toLocaleString()}
            subtitle="last 90 days"
            icon={<PhoneOutgoing className="w-5 h-5" />}
          />
          <StatCard
            title="Total Calls"
            value={calls.total.toLocaleString()}
            subtitle="in + out"
            icon={<Phone className="w-5 h-5" />}
          />
        </div>
      </div>

      {/* 14-day trend + channel mix */}
      <div>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 pb-2 border-b border-slate-200">
          Activity Breakdown
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-4">
              14-Day Inbound Call Trend
            </h4>
            {trendChartData.length > 0 ? (
              <StackedBarChart
                data={trendChartData}
                xKey="label"
                bars={[
                  { key: "Answered", color: "#10b981", label: "Answered" },
                  { key: "Missed", color: "#ef4444", label: "Missed" },
                ]}
                stacked
                height={220}
              />
            ) : (
              <p className="text-sm text-slate-400 py-8 text-center">
                No call data in the last 14 days
              </p>
            )}
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-4">
              Conversation Channel Mix
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-500 text-left">
                    <th className="pb-2 font-medium text-xs">Channel</th>
                    <th className="pb-2 font-medium text-xs text-right">
                      Count
                    </th>
                    <th className="pb-2 font-medium text-xs text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {channelMix.slice(0, 8).map((ch) => {
                    const label =
                      CHANNEL_LABELS[ch.type] ||
                      ch.type.replace("TYPE_", "").replace(/_/g, " ");
                    const pct =
                      channelTotal > 0
                        ? Math.round((ch.count / channelTotal) * 100)
                        : 0;
                    return (
                      <tr
                        key={ch.type}
                        className="border-t border-slate-100"
                      >
                        <td className="py-2 text-slate-700">{label}</td>
                        <td className="py-2 text-right">
                          {ch.count.toLocaleString()}
                        </td>
                        <td className="py-2 text-right text-slate-400">
                          {pct}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Calls by Rep */}
      <div>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 pb-2 border-b border-slate-200">
          Calls by Rep
        </h3>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-slate-500 text-left">
                  <th className="px-5 py-3 font-medium">Rep</th>
                  <th className="px-5 py-3 font-medium text-right">
                    Inbound
                  </th>
                  <th className="px-5 py-3 font-medium text-right">
                    Answered
                  </th>
                  <th className="px-5 py-3 font-medium text-right">
                    Missed
                  </th>
                  <th className="px-5 py-3 font-medium text-right">
                    Answer Rate
                  </th>
                </tr>
              </thead>
              <tbody>
                {byUser.length > 0 ? (
                  byUser.map((u) => (
                    <tr
                      key={u.userId}
                      className="border-t border-slate-100 hover:bg-slate-50"
                    >
                      <td className="px-5 py-3 font-medium text-slate-900">
                        {u.name}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {u.inbound.toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {u.answered.toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {u.missed.toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span
                          className={`inline-flex items-center gap-2 px-2 py-0.5 rounded-full text-xs font-semibold ${rateColor(
                            u.answerRate
                          )}`}
                        >
                          {Math.round(u.answerRate * 100)}%
                        </span>
                        <div className="inline-block ml-2 w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden align-middle">
                          <div
                            className={`h-full rounded-full ${
                              u.answerRate >= 0.8
                                ? "bg-emerald-500"
                                : u.answerRate >= 0.6
                                  ? "bg-amber-500"
                                  : "bg-red-500"
                            }`}
                            style={{
                              width: `${Math.round(u.answerRate * 100)}%`,
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-8 text-center text-slate-400"
                    >
                      No inbound call data found in the last 90 days.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
