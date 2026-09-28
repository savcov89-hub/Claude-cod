// Supabase Edge Function "api". server.js is backend/server.ts bundled with its dependencies (`npm run build:api`).
import { createSupabaseServer } from './server.js';

Deno.serve(createSupabaseServer(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!));
