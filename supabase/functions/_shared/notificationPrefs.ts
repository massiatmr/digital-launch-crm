// Helpers to respect per-user, per-workspace notification preferences.
// Each user can mute email/push notifications for specific workspaces.
// Default (no row): both channels enabled.

export type NotifChannel = "email" | "push";

export async function getMutedUserIds(
  admin: any,
  workspaceId: string | null | undefined,
  userIds: string[],
  channel: NotifChannel,
): Promise<Set<string>> {
  const muted = new Set<string>();
  if (!workspaceId || !userIds || userIds.length === 0) return muted;
  try {
    const col = channel === "email" ? "email_enabled" : "push_enabled";
    const { data, error } = await admin
      .from("user_workspace_notification_prefs")
      .select(`user_id, ${col}`)
      .eq("workspace_id", workspaceId)
      .in("user_id", userIds);
    if (error) {
      console.error("getMutedUserIds failed", error);
      return muted;
    }
    for (const row of data || []) {
      if ((row as any)[col] === false) muted.add((row as any).user_id);
    }
  } catch (e) {
    console.error("getMutedUserIds threw", e);
  }
  return muted;
}

export async function filterUserIdsByChannel(
  admin: any,
  workspaceId: string | null | undefined,
  userIds: string[],
  channel: NotifChannel,
): Promise<string[]> {
  const muted = await getMutedUserIds(admin, workspaceId, userIds, channel);
  return userIds.filter((u) => !muted.has(u));
}
