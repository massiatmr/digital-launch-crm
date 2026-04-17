// Sends a document (PDF) by email via SMTP.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { recipientEmail, subject, documentBase64, documentName, message } = await req.json();
    if (!recipientEmail || !subject) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const safeMsg = String(message || '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
        <div style="text-align: center; padding: 10px 0 20px;">
          <img src="https://rvangzupebrajhhhvewu.supabase.co/storage/v1/object/public/email-assets/logo.png" alt="Digital Launch" width="160" style="max-width: 160px; height: auto; display: inline-block;" />
        </div>
        <p style="white-space: pre-line; color: #444; font-size: 15px; line-height: 1.6;">${safeMsg}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px;">
          DIGITAL LAUNCH LLC — 75 E 3RD ST, Sheridan, Wyoming 82801<br/>
          contact@digitallaunch-llc.com
        </p>
      </div>`;

    const body: Record<string, unknown> = {
      to: recipientEmail,
      subject,
      html: emailHtml,
    };
    if (documentBase64 && documentName) {
      body.attachments = [{
        filename: documentName,
        content: documentBase64,
        contentType: 'application/pdf',
      }];
    }

    const { data, error } = await supabase.functions.invoke('send-smtp-email', { body });
    if (error) {
      console.error('SMTP send error:', error);
      return new Response(JSON.stringify({ error: 'Failed to send email' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
