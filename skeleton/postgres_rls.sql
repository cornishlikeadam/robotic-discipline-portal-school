-- Supabase exposes every table in the `public` schema through its REST API
-- using the public anon key. Turning on row level security with NO policies
-- blocks that path entirely; the app reaches these tables only through its
-- own server connection (DATABASE_URL), which is not subject to these rules.
ALTER TABLE companions ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE fragment_exchanges ENABLE ROW LEVEL SECURITY;
ALTER TABLE ritual_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE capability_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE royalty_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
