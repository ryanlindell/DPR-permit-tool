import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

function readEnv(name) {
  const processValue = process.env[name];
  if (processValue) return processValue;
  let file;
  try { file = readFileSync(resolve(process.cwd(), ".env.local"), "utf8"); }
  catch { return ""; }
  const match = file.match(new RegExp(`^\\s*${name}\\s*=\\s*(.*?)\\s*$`, "m"));
  return (match?.[1] ?? "").replace(/^(['"])(.*)\1$/, "$2");
}

const projectUrl = readEnv("VITE_SUPABASE_URL").replace(/\/$/, "");
const publishableKey = readEnv("VITE_SUPABASE_PUBLISHABLE_KEY");
if (!projectUrl || !publishableKey) {
  console.error("Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local or the environment.");
  process.exit(2);
}

const headers = { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` };
const tables = [
  ["profiles", "id"],
  ["account_settings", "owner_id"],
  ["fields", "id"],
  ["field_overlaps", "owner_id"],
  ["versions", "id"],
  ["permits", "id"],
  ["edit_locks", "owner_id"],
  ["invite_codes", "code"],
];
let failed = false;

try {
  const response = await fetch(`${projectUrl}/auth/v1/settings`, { headers });
  const settings = response.ok ? await response.json() : null;
  if (settings?.disable_signup === true) console.log("PASS public email signup: disabled");
  else if (settings?.disable_signup === false) {
    console.log("FAIL public email signup: enabled; direct Auth signup can bypass invite validation");
    failed = true;
  } else {
    console.log(`CHECK public email signup: settings unavailable (HTTP ${response.status})`);
    failed = true;
  }
} catch {
  console.log("CHECK public email signup: request failed");
  failed = true;
}

for (const [table, column] of tables) {
  try {
    const response = await fetch(`${projectUrl}/rest/v1/${table}?select=${column}&limit=1`, { headers });
    if (response.status === 401 || response.status === 403) {
      console.log(`PASS anonymous ${table}: denied (${response.status})`);
      continue;
    }
    if (!response.ok) {
      console.log(`CHECK anonymous ${table}: HTTP ${response.status}`);
      failed = true;
      continue;
    }
    const rows = await response.json();
    if (Array.isArray(rows) && rows.length === 0) console.log(`PASS anonymous ${table}: no rows visible`);
    else {
      console.log(`FAIL anonymous ${table}: at least one row is visible (row content withheld)`);
      failed = true;
    }
  } catch {
    console.log(`CHECK anonymous ${table}: request failed`);
    failed = true;
  }
}

try {
  const response = await fetch(`${projectUrl}/rest/v1/rpc/get_shared_view`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ token: randomUUID() }),
  });
  const result = response.ok ? await response.json() : undefined;
  if (response.ok && result === null) console.log("PASS anonymous get_shared_view: unknown token returns null");
  else {
    console.log(`FAIL anonymous get_shared_view: expected null, received HTTP ${response.status}`);
    failed = true;
  }
} catch {
  console.log("CHECK anonymous get_shared_view: request failed");
  failed = true;
}

try {
  const response = await fetch(`${projectUrl}/functions/v1/signup-with-invite`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ username: `phase4-${randomUUID().slice(0, 8)}`, password: "throwaway-smoke-password", inviteCode: "" }),
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 400 && body.error === "Enter an invite code.") console.log("PASS signup-with-invite: blank code rejected before invite consumption");
  else {
    console.log(`FAIL signup-with-invite: blank code returned HTTP ${response.status}`);
    failed = true;
  }
} catch {
  console.log("CHECK signup-with-invite: request failed");
  failed = true;
}

if (failed) process.exitCode = 1;
