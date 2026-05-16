export interface GhlUser {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  deleted: boolean;
  profilePhoto?: string;
}

export interface PipelineStage {
  id: string;
  name: string;
  position: number;
  showInFunnel: boolean;
  showInPieChart: boolean;
  stageWinProbability: number;
  color: string;
}

export interface Pipeline {
  id: string;
  name: string;
  stages: PipelineStage[];
  dateAdded: string;
  dateUpdated: string;
  locationId: string;
}

export interface OpportunityContact {
  id: string;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  tags: string[];
}

export interface CustomField {
  id: string;
  type: string;
  fieldValueString?: string;
  fieldValueNumber?: number;
  fieldValueDate?: number;
  fieldValueArray?: string[];
  fieldValueFiles?: Array<{
    url: string;
    meta: { name: string; size: number; mimetype: string };
  }>;
}

export interface Opportunity {
  id: string;
  name: string;
  monetaryValue: number;
  pipelineId: string;
  pipelineStageId: string;
  assignedTo: string | null;
  status: "open" | "won" | "lost" | "abandoned";
  source: string | null;
  lastStatusChangeAt: string;
  lastStageChangeAt: string;
  createdAt: string;
  updatedAt: string;
  contactId: string;
  locationId: string;
  customFields: CustomField[];
  contact: OpportunityContact;
  attributions?: Array<{
    utmSessionSource?: string;
    medium?: string;
    isFirst?: boolean;
  }>;
}

export interface OpportunitySearchResult {
  opportunities: Opportunity[];
  meta: {
    total: number;
    nextPageUrl: string | null;
    startAfterId: string | null;
    startAfter: number | null;
    currentPage: number;
  };
}

export interface Contact {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  tags?: string[];
  dateAdded?: string;
  dateUpdated?: string;
  source?: string;
  customFields?: CustomField[];
}

export interface ContactSearchResult {
  contacts: Contact[];
  total: number;
}

// Call / conversation analytics (from /api/call-stats)
export interface CallStats {
  fetchedAt: string;
  window: { conversations: number; days: number };
  calls: {
    total: number;
    inbound: number;
    outbound: number;
    missed: number;
    answered: number;
    answerRate: number;
  };
  byUser: Array<{
    userId: string;
    name: string;
    inbound: number;
    missed: number;
    answered: number;
    answerRate: number;
  }>;
  trend: Array<{
    date: string;
    inbound: number;
    missed: number;
    outbound: number;
  }>;
  channelMix: Array<{
    type: string;
    count: number;
  }>;
}

// Dashboard-specific types
export interface StageCount {
  stageId: string;
  stageName: string;
  count: number;
  totalValue: number;
  position: number;
}

export interface KpiMetrics {
  totalLeads: number;
  newLeadsThisPeriod: number;
  qualifiedLeads: number;
  totalDeals: number;
  openDeals: number;
  closedWonDeals: number;
  closedLostDeals: number;
  totalRevenue: number;
  avgDealSize: number;
  winRate: number;
  pipelineValue: number;
}

export interface TeamMemberMetrics {
  userId: string;
  userName: string;
  assignedLeads: number;
  assignedDeals: number;
  closedWon: number;
  closedLost: number;
  totalValue: number;
  winRate: number;
}

export interface LeadSourceMetrics {
  source: string;
  count: number;
  converted: number;
  conversionRate: number;
  totalValue: number;
}

// Pipeline config - maps pipeline/stage IDs to names
export const PIPELINES = {
  leadManagement: {
    id: "XCmJYlRdBlWoIFUpCl8t",
    name: "Lead Management",
  },
  acquisitions: {
    id: "U4YiDhO4cWy2Z07H2OcU",
    name: "Acquisitions",
  },
  disposition: {
    id: "KP5eOzAFCZJKbNmExR07",
    name: "Disposition",
  },
  archive2024: {
    id: "BdfsmFlfBPzwuSXAd0CT",
    name: "[Archive] PPP 2024 Deals",
  },
  archive2025: {
    id: "uQosjSQdmOQt0WkKU7cY",
    name: "[Archive] PPP 2025 Deals",
  },
} as const;

// Deal pipelines — disposition + archives (used for CEO Dashboard revenue)
export const DEAL_PIPELINE_IDS = [
  PIPELINES.disposition.id,
  PIPELINES.archive2024.id,
  PIPELINES.archive2025.id,
] as const;

// Custom field IDs for deal financials (on Disposition/Archive opportunities)
export const CUSTOM_FIELDS = {
  purchasePrice: "yy1zQAy8Exipwv8esZbm",
  buyerPrice: "Y66sQcMfpiuozAYgotEJ",
  assignmentFee: "Jxw7EXRUuNVkplvUOQbg",
} as const;

// Contact-level custom field IDs for lead source tracking
export const CONTACT_FIELDS = {
  leadSource: "vqDUdqc8vIRZR5mjp8ul",
  subSource: "tZNoytQqIIcYz1XTVUpZ",
  leadStatus: "U7iFpnPZo9qlcXZ2hjrx",
  leadTemperature: "YoDVi2rywehyJkz3meHP",
  propertyType: "qRtwlW07FS8QmHHx1qMU",
  occupancyStatus: "Cqsilf3NT7BlYgPzbNox",
} as const;

/** Classify a contact or opportunity into a lead source channel */
export function getLeadChannel(item: {
  source?: string | null;
  contact?: { tags?: string[] } | null;
  tags?: string[];
}): "DIY" | "REMail" | "PPL" | "Other" {
  const src = (item.source ?? "").toLowerCase();
  const tags = (item.contact?.tags ?? item.tags ?? []).map((t) =>
    t.toLowerCase()
  );

  // Check source field first (most reliable)
  if (src.includes("cold calling") || src.includes("diy")) return "DIY";
  if (src.includes("organic") || src.includes("website")) return "DIY";
  if (src.includes("remail") || src.includes("direct mailer")) return "REMail";
  if (src.includes("ppl") || src.includes("red panda")) return "PPL";

  // Fall back to tags
  if (tags.some((t) => t.includes("diy") || t === "website" || t === "organic"))
    return "DIY";
  if (tags.some((t) => t === "remail" || t === "dm force")) return "REMail";
  if (tags.some((t) => t === "ppl" || t === "redpanda")) return "PPL";
  if (tags.some((t) => t === "mail")) return "REMail";

  return "Other";
}

/** Extract the assignment fee from custom fields, falling back to monetaryValue */
export function getDealRevenue(opp: Opportunity): number {
  const feeField = opp.customFields?.find(
    (f) => f.id === CUSTOM_FIELDS.assignmentFee
  );
  if (feeField) {
    const val = feeField.fieldValueNumber ?? parseFloat(feeField.fieldValueString ?? "");
    if (val && !isNaN(val) && val > 0) return val;
  }
  return opp.monetaryValue ?? 0;
}

/** Extract purchase price from custom fields */
export function getPurchasePrice(opp: Opportunity): number {
  const field = opp.customFields?.find(
    (f) => f.id === CUSTOM_FIELDS.purchasePrice
  );
  if (field) {
    const val = field.fieldValueNumber ?? parseFloat(field.fieldValueString ?? "");
    if (val && !isNaN(val) && val > 0) return val;
  }
  return 0;
}

/** Extract buyer/dispo price from custom fields */
export function getBuyerPrice(opp: Opportunity): number {
  const field = opp.customFields?.find(
    (f) => f.id === CUSTOM_FIELDS.buyerPrice
  );
  if (field) {
    const val = field.fieldValueNumber ?? parseFloat(field.fieldValueString ?? "");
    if (val && !isNaN(val) && val > 0) return val;
  }
  return 0;
}

/** Build a stage ID → stage name lookup from pipeline data */
export function buildStageMap(pipelines: Pipeline[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const p of pipelines) {
    for (const s of p.stages) {
      map[s.id] = s.name;
    }
  }
  return map;
}

export const USERS: Record<string, string> = {
  "22uQY2xLoEhFVC5TqQK2": "Brittany McCracken",
  ghrAFUOX3h622gtOCj4x: "Elia Belmonte",
  "2bI3rIXWqVz1jLp27G3R": "Kevin Green",
  aWRf5CMISnnjgMbflFQW: "Omnia Salem",
  Xn4NpA2NR7GLsTxM0mh3: "Pete Russell",
  PHNQ9GPpEjj7qmCNjozP: "Andrea",
};
