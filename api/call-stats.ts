import type { VercelRequest, VercelResponse } from "@vercel/node";

const BASE = "https://services.leadconnectorhq.com";

function ghlHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Version: "2021-07-28",
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

interface Conversation {
  id: string;
  lastMessageType?: string;
  lastMessageDirection?: string;
  lastMessageDate?: number;
  lastMessageBody?: string;
  dateAdded?: number;
  assignedTo?: string;
  tags?: string[];
  type?: string;
}

interface UserInfo {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

async function fetchConversations(
  locationId: string,
  h: Record<string, string>,
  maxPages = 15
): Promise<Conversation[]> {
  const all: Conversation[] = [];
  let lastId: string | null = null;
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;

  for (let page = 0; page < maxPages; page++) {
    let url = `${BASE}/conversations/search?locationId=${locationId}&limit=20`;
    if (lastId) url += `&lastId=${lastId}`;

    const resp = await fetch(url, { headers: h });
    if (!resp.ok) break;

    const data = await resp.json();
    const batch: Conversation[] = data.conversations || [];
    if (!batch.length) break;

    all.push(...batch);

    const oldest = batch[batch.length - 1];
    const oldestTs = oldest.lastMessageDate || oldest.dateAdded || 0;
    if (oldestTs < ninetyDaysAgo) break;

    lastId = oldest.id;
    if (batch.length < 20) break;
  }

  return all;
}

async function fetchUsers(
  locationId: string,
  h: Record<string, string>
): Promise<Record<string, string>> {
  try {
    const resp = await fetch(`${BASE}/users/?locationId=${locationId}`, {
      headers: h,
    });
    if (!resp.ok) return {};
    const data = await resp.json();
    const map: Record<string, string> = {};
    for (const u of (data.users || []) as UserInfo[]) {
      map[u.id] =
        u.name ||
        `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
        u.email ||
        u.id;
    }
    return map;
  } catch {
    return {};
  }
}

const MISSED_PATTERNS = [/missed/i, /no answer/i, /voicemail/i, /left vm/i, /ghost call/i];

function looksLikeMissed(conv: Conversation): boolean {
  if ((conv.tags || []).some((t) => /missed/i.test(t))) return true;
  const body = (conv.lastMessageBody || "").toLowerCase();
  return MISSED_PATTERNS.some((p) => p.test(body));
}

function toDateStr(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function lastNDays(n: number): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.GHL_PRIVATE_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!apiKey || !locationId) {
    return res.status(500).json({ error: "GHL credentials not configured" });
  }

  const h = ghlHeaders(apiKey);

  try {
    const [conversations, userMap] = await Promise.all([
      fetchConversations(locationId, h, 15),
      fetchUsers(locationId, h),
    ]);

    // Call filtering
    const callConvs = conversations.filter(
      (c) => c.lastMessageType === "TYPE_CALL"
    );
    const inboundCalls = callConvs.filter(
      (c) => c.lastMessageDirection === "inbound"
    );
    const outboundCalls = callConvs.filter(
      (c) => c.lastMessageDirection === "outbound"
    );
    const missedConvs = inboundCalls.filter(looksLikeMissed);
    const answeredCalls = inboundCalls.length - missedConvs.length;

    // By-user aggregation
    const userStats: Record<
      string,
      {
        userId: string;
        name: string;
        inbound: number;
        missed: number;
        answered: number;
        answerRate: number;
      }
    > = {};

    for (const c of inboundCalls) {
      const uid = c.assignedTo || "unassigned";
      if (!userStats[uid]) {
        userStats[uid] = {
          userId: uid,
          name: userMap[uid] || "Unassigned",
          inbound: 0,
          missed: 0,
          answered: 0,
          answerRate: 0,
        };
      }
      userStats[uid].inbound++;
      if (looksLikeMissed(c)) userStats[uid].missed++;
    }

    const byUser = Object.values(userStats)
      .map((u) => ({
        ...u,
        answered: u.inbound - u.missed,
        answerRate: u.inbound ? (u.inbound - u.missed) / u.inbound : 0,
      }))
      .sort((a, b) => b.inbound - a.inbound);

    // 14-day trend
    const days14 = lastNDays(14);
    const cutoff14 = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const dayMap: Record<
      string,
      { inbound: number; missed: number; outbound: number }
    > = {};
    for (const d of days14) dayMap[d] = { inbound: 0, missed: 0, outbound: 0 };

    for (const c of callConvs) {
      const ts = c.lastMessageDate || c.dateAdded || 0;
      if (ts < cutoff14) continue;
      const day = toDateStr(ts);
      if (!dayMap[day]) continue;
      if (c.lastMessageDirection === "inbound") {
        dayMap[day].inbound++;
        if (looksLikeMissed(c)) dayMap[day].missed++;
      } else {
        dayMap[day].outbound++;
      }
    }
    const trend = days14.map((d) => ({ date: d, ...dayMap[d] }));

    // Channel mix
    const typeCounts: Record<string, number> = {};
    for (const c of conversations) {
      const t = c.lastMessageType || "UNKNOWN";
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }

    const channelMix = Object.entries(typeCounts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=120");
    return res.status(200).json({
      fetchedAt: new Date().toISOString(),
      window: { conversations: conversations.length, days: 90 },
      calls: {
        total: callConvs.length,
        inbound: inboundCalls.length,
        outbound: outboundCalls.length,
        missed: missedConvs.length,
        answered: answeredCalls,
        answerRate: inboundCalls.length
          ? answeredCalls / inboundCalls.length
          : 0,
      },
      byUser,
      trend,
      channelMix,
    });
  } catch (err) {
    console.error("[call-stats] handler error:", err);
    return res
      .status(500)
      .json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
}
