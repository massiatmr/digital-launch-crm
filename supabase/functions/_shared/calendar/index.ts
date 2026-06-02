// Façade unifiée pour les providers de calendrier (Google, Microsoft, CalDAV, iCal).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type { CalendarAccount, CalendarEventInput, CalendarEventResult, CalendarProviderAdapter, BusyInterval, FreeBusyRange, CalendarProvider } from "./types.ts";
import { googleCalendar } from "./google.ts";
import { microsoftCalendar } from "./microsoft.ts";
import { caldavCalendar } from "./caldav.ts";
import { icalCalendar } from "./ical.ts";

export type { CalendarAccount, CalendarEventInput, CalendarEventResult, BusyInterval, FreeBusyRange, CalendarProvider };

const ADAPTERS: Record<CalendarProvider, CalendarProviderAdapter> = {
  google: googleCalendar,
  microsoft: microsoftCalendar,
  caldav: caldavCalendar,
  ical: icalCalendar,
};

export function adapterFor(provider: CalendarProvider): CalendarProviderAdapter {
  return ADAPTERS[provider];
}

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

export async function listWorkspaceAccounts(workspaceId: string): Promise<CalendarAccount[]> {
  const { data, error } = await admin()
    .from("calendar_accounts")
    .select("*")
    .eq("workspace_id", workspaceId);
  if (error) throw error;
  return (data || []) as CalendarAccount[];
}

export async function getPrimaryAccount(workspaceId: string): Promise<CalendarAccount | null> {
  const { data, error } = await admin()
    .from("calendar_accounts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("is_primary", true)
    .maybeSingle();
  if (error) throw error;
  return (data as CalendarAccount) ?? null;
}

/** Agrège les busy intervals de TOUS les comptes (avec sync_freebusy = true) du workspace. */
export async function getWorkspaceFreeBusy(workspaceId: string, range: FreeBusyRange): Promise<BusyInterval[]> {
  const accounts = (await listWorkspaceAccounts(workspaceId)).filter(a => a.sync_freebusy);
  const all: BusyInterval[] = [];
  for (const acc of accounts) {
    try {
      const busy = await adapterFor(acc.provider).getFreeBusy(acc, range);
      all.push(...busy);
    } catch (err) {
      console.error(`[calendar:${acc.provider}] freebusy failed for ${acc.id}`, err);
    }
  }
  return all;
}

/** Crée l'évènement uniquement sur le compte primary du workspace. Retourne null si aucun primary. */
export async function createEventOnPrimary(workspaceId: string, ev: CalendarEventInput): Promise<CalendarEventResult | null> {
  const primary = await getPrimaryAccount(workspaceId);
  if (!primary) return null;
  return await adapterFor(primary.provider).createEvent(primary, ev);
}
