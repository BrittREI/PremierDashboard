import { useQuery } from "@tanstack/react-query";
import {
  listPipelines,
  fetchAllOpportunities,
  searchContacts,
  listUsers,
  fetchCallStats,
} from "@/api/ghl-client";
import { PIPELINES } from "@/types/ghl";

/** All pipelines with their stages */
export function usePipelines() {
  return useQuery({
    queryKey: ["pipelines"],
    queryFn: listPipelines,
    staleTime: 5 * 60 * 1000,
  });
}

/** All opportunities for a specific pipeline */
export function useOpportunities(pipelineId: string) {
  return useQuery({
    queryKey: ["opportunities", pipelineId],
    queryFn: () => fetchAllOpportunities(pipelineId),
    staleTime: 2 * 60 * 1000,
  });
}

/** All opportunities across all active pipelines */
export function useAllOpportunities() {
  const leadMgmt = useOpportunities(PIPELINES.leadManagement.id);
  const acquisitions = useOpportunities(PIPELINES.acquisitions.id);
  const disposition = useOpportunities(PIPELINES.disposition.id);

  return {
    leadManagement: leadMgmt.data ?? [],
    acquisitions: acquisitions.data ?? [],
    disposition: disposition.data ?? [],
    all: [
      ...(leadMgmt.data ?? []),
      ...(acquisitions.data ?? []),
      ...(disposition.data ?? []),
    ],
    isLoading:
      leadMgmt.isLoading || acquisitions.isLoading || disposition.isLoading,
    error: leadMgmt.error || acquisitions.error || disposition.error,
    refetch: () => {
      leadMgmt.refetch();
      acquisitions.refetch();
      disposition.refetch();
    },
  };
}

/** Recent contacts */
export function useContacts(opts?: {
  tag?: string;
  dateAddedAfter?: number;
  dateAddedBefore?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["contacts", opts],
    queryFn: () =>
      searchContacts({
        tag: opts?.tag,
        dateAddedAfter: opts?.dateAddedAfter,
        dateAddedBefore: opts?.dateAddedBefore,
        limit: opts?.limit ?? 100,
      }),
    staleTime: 2 * 60 * 1000,
  });
}

/** GHL users/team members */
export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: listUsers,
    staleTime: 10 * 60 * 1000,
  });
}

/** Call/conversation analytics */
export function useCallStats() {
  return useQuery({
    queryKey: ["call-stats"],
    queryFn: fetchCallStats,
    staleTime: 5 * 60 * 1000,
  });
}
