CREATE TABLE IF NOT EXISTS community_feedback (
  id UUID PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('anomaly', 'not_anomaly', 'unsure')),
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 2000),
  context JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_feedback_candidate_created_idx
  ON community_feedback (candidate_id, created_at DESC);
