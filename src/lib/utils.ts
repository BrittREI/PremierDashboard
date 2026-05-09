import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

export function getLeadSource(opp: {
  source?: string | null;
  customFields?: Array<{
    id: string;
    fieldValueString?: string;
  }>;
  attributions?: Array<{
    utmSessionSource?: string;
    medium?: string;
  }>;
}): string {
  // Check custom field for lead source (am2k4nxWY9tvT8armsVh = Lead Source)
  const sourceField = opp.customFields?.find(
    (f) => f.id === "am2k4nxWY9tvT8armsVh"
  );
  if (sourceField?.fieldValueString) return sourceField.fieldValueString;

  // Check opportunity source
  if (opp.source) return opp.source;

  // Check attributions
  const attr = opp.attributions?.[0];
  if (attr?.medium) {
    if (attr.medium === "csv_import") return "CSV Import";
    if (attr.medium === "chat_widget") return "Website Chat";
    if (attr.medium === "conversation") return "Conversation";
    return attr.medium;
  }

  return "Unknown";
}

export function getSubSource(opp: {
  customFields?: Array<{
    id: string;
    fieldValueString?: string;
  }>;
}): string {
  // Check custom field for sub-source (59CES9B3CSCWGn2ZBZro)
  const subField = opp.customFields?.find(
    (f) => f.id === "59CES9B3CSCWGn2ZBZro"
  );
  return subField?.fieldValueString ?? "";
}
