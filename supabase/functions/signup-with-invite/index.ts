import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage",
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });

  try {
    const { username, password, inviteCode } = await request.json();
    const cleanUsername = String(username ?? "").trim().toLowerCase();
    const code = String(inviteCode ?? "").trim();
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(cleanUsername)) throw new Error("Username must be 3–32 characters and use letters, numbers, dots, underscores, or hyphens.");
    if (typeof password !== "string" || password.length < 8) throw new Error("Password must be at least 8 characters.");
    if (!code) throw new Error("Enter an invite code.");

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await admin.rpc("consume_invite_code", { p_code: code });
    if (error || data !== true) throw new Error("Invite code is invalid or has no uses remaining.");

    const email = `${cleanUsername}@users.fieldpermits.invalid`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { username: cleanUsername },
    });
    if (createError) {
      await admin.rpc("restore_invite_code", { p_code: code });
      throw new Error(createError.message);
    }
    return Response.json({ user: { id: created.user.id, username: cleanUsername } }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Signup failed." }, { status: 400, headers: corsHeaders });
  }
});
