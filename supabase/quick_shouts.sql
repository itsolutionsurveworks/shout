-- Personal quick shouts. Run once in the Supabase SQL editor (after schema.sql).
-- Each user owns their own list; nobody else can read or change it.

CREATE TABLE quick_shouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL CHECK (char_length(btrim(text)) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON quick_shouts (owner_id, created_at);

ALTER TABLE quick_shouts ENABLE ROW LEVEL SECURITY;

-- Full CRUD, but only on rows you own. WITH CHECK stops you handing a row to someone else.
CREATE POLICY "Owners manage own quick shouts" ON quick_shouts FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
