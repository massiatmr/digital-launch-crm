import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MetaCampaignRow = {
  campaign_id: string;
  campaign_name: string;
  status: string;
  effective_status: string | null;
  objective: string | null;
  page_name: string;
  spend: number;
  currency: string;
  impressions: number;
  clicks: number;
  leads_crm: number;
  leads_meta: number;
  cpl_crm: number | null;
  cpl_meta: number | null;
};

export type MetaCampaignsResponse = {
  campaigns: MetaCampaignRow[];
  needs_reconnect: string[];
  from_cache?: boolean;
};

export function useMetaCampaigns(opts: {
  workspaceId: string | null;
  dateFrom: Date;
  dateTo: Date;
  includePaused: boolean;
  enabled?: boolean;
}) {
  const { workspaceId, dateFrom, dateTo, includePaused, enabled = true } = opts;
  const fromStr = dateFrom.toISOString().slice(0, 10);
  const toStr = dateTo.toISOString().slice(0, 10);

  return useQuery({
    queryKey: ["meta-campaigns", workspaceId, fromStr, toStr, includePaused],
    enabled,
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<MetaCampaignsResponse> => {
      const { data, error } = await supabase.functions.invoke("meta-ads-insights", {
        body: {
          workspace_id: workspaceId,
          date_from: fromStr,
          date_to: toStr,
          include_paused: includePaused,
        },
      });
      if (error) throw error;
      return (data as MetaCampaignsResponse) ?? { campaigns: [], needs_reconnect: [] };
    },
  });
}
