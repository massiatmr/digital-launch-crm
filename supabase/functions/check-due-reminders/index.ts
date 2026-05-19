const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const bearer = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  if (bearer !== SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find reminders that are due (within last 5 minutes to avoid duplicates) and not done
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const { data: dueReminders, error } = await supabase
      .from("reminders")
      .select("id, action, due_date, owner_id, lead_id, leads(name)")
      .eq("done", false)
      .lte("due_date", now.toISOString())
      .gte("due_date", fiveMinAgo.toISOString());

    if (error) throw error;

    if (!dueReminders || dueReminders.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sent = 0;

    for (const reminder of dueReminders) {
      const leadName = (reminder.leads as any)?.name || "Lead";

      // Call send-onesignal-notification for this user
      const pushResponse = await fetch(`${SUPABASE_URL}/functions/v1/send-onesignal-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          user_id: reminder.owner_id,
          title: `🔔 Rappel : ${leadName}`,
          body: reminder.action,
          url: `/reminders?highlight=${reminder.id}`,
          tag: `reminder-${reminder.id}`.slice(0, 32),
        }),
      });

      const pushText = await pushResponse.text();
      let pushJson: any = null;
      try {
        pushJson = JSON.parse(pushText);
      } catch {
        pushJson = null;
      }

      if (pushResponse.ok && pushJson?.ok !== false) {
        sent++;
        console.log(`Push sent for reminder ${reminder.id}:`, pushText);
      } else {
        console.error(`Push failed for reminder ${reminder.id}:`, pushText);
      }
    }

    return new Response(JSON.stringify({ processed: dueReminders.length, sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("check-due-reminders error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
