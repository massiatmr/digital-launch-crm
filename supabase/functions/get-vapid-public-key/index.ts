import { p256 } from "https://esm.sh/@noble/curves@1.4.2/p256";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function base64UrlDecode(str: string): Uint8Array {
  const padding = '='.repeat((4 - (str.length % 4)) % 4);
  const base64 = (str + padding).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function base64UrlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

Deno.serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
  const publicKey = privateKey
    ? base64UrlEncode(p256.getPublicKey(base64UrlDecode(privateKey), false))
    : '';

  return new Response(JSON.stringify({ publicKey }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  });
});
