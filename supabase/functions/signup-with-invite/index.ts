import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage",
};

class RequestError extends Error {}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });

  try {
    let body: unknown;
    try { body = await request.json(); }
    catch { throw new RequestError("Request body must be valid JSON."); }
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new RequestError("Request body must be an object.");
    const input = body as Record<string, unknown>;
    const cleanUsername = typeof input.username === "string" ? input.username.trim().toLowerCase() : "";
    const password = input.password;
    const code = typeof input.inviteCode === "string" ? input.inviteCode.trim() : "";
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(cleanUsername)) throw new RequestError("Username must be 3–32 characters and use letters, numbers, dots, underscores, or hyphens.");
    if (typeof password !== "string" || password.length < 8) throw new RequestError("Password must be at least 8 characters.");
    if (!code) throw new RequestError("Enter an invite code.");

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new Error("Signup service is not configured.");
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await admin.rpc("consume_invite_code", { p_code: code });
    if (error) throw new Error("Invite validation failed.");
    if (data !== true) throw new RequestError("Invite code is invalid or has no uses remaining.");

    const email = `${cleanUsername}@users.fieldpermits.invalid`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username: cleanUsername },
      // This server-written marker is checked by the auth.users trigger. Direct public
      // Auth signup cannot set app_metadata, so it cannot bypass the invite function.
      app_metadata: { invite_signup: true },
    });
    if (createError) {
      const { error: restoreError } = await admin.rpc("restore_invite_code", { p_code: code });
      if (restoreError) console.error("Could not restore invite usage after account creation failed.");
      throw new RequestError("Could not create the account. Check that the username is available and try again.");
    }
    return Response.json({ user: { id: created.user.id, username: cleanUsername } }, { headers: corsHeaders });
  } catch (error) {
    const isRequestError = error instanceof RequestError;
    if (!isRequestError) console.error("Signup request failed.");
    return Response.json({ error: isRequestError ? error.message : "Signup is temporarily unavailable. Try again later." }, { status: isRequestError ? 400 : 500, headers: corsHeaders });
  }
});
