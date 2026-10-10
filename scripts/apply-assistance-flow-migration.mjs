// One-off: add the assistance-flow columns to public.events via the Supabase
// Management API (the only path that can run DDL — supabase-js goes through
// PostgREST which rejects ALTER TABLE).
//
// Columns: helper_user_id, helper_name, creator_confirmed_resolved,
// helper_confirmed_resolved — see supabase/migrations/20261010140000_events_assistance_flow.sql
//
// Usage:
//   SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/apply-assistance-flow-migration.mjs
//
// The token is read from the environment only — never hardcoded. Revoke it in
// https://supabase.com/dashboard/account/tokens after running this script.
//
// The SQL statements are idempotent (IF NOT EXISTS), so it is safe to re-run.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN is required');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const projectRef = new URL(process.env.SUPABASE_URL).hostname.split('.')[0];
const sql = readFileSync(join(here, '..', 'supabase', 'migrations', '20261010140000_events_assistance_flow.sql'), 'utf8');

const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
});

if (!response.ok) {
  console.error(`[mgmt] failed: ${response.status} ${await response.text()}`);
  process.exit(1);
}

console.log('[mgmt] assistance-flow columns added ✅');
