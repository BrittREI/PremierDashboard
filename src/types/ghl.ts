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
} as const;

export const USERS: Record<string, string> = {
  "22uQY2xLoEhFVC5TqQK2": "Brittany McCracken",
  ghrAFUOX3h622gtOCj4x: "Elia Belmonte",
  "2bI3rIXWqVz1jLp27G3R": "Kevin Green",
  aWRf5CMISnnjgMbflFQW: "Omnia Salem",
  Xn4NpA2NR7GLsTxM0mh3: "Pete Russell",
  PHNQ9GPpEjj7qmCNjozP: "Andrea",
};
