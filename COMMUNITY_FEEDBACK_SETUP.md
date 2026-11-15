# Community feedback storage

Feedback is stored in PostgreSQL through `DATABASE_URL`. For Vercel, provision a PostgreSQL database from the Marketplace (such as Neon or Supabase), connect it to the SearchX project, and make sure its connection string is available to the Node.js function as `DATABASE_URL`.

Apply `migrations/001_community_feedback.sql` once to the database before collecting responses. Locally, set `DATABASE_URL` to a development PostgreSQL database and apply the same migration.

Each response stores the candidate ID, vote (`anomaly`, `not_anomaly`, or `unsure`), optional note (up to 2,000 characters), candidate position, source, frame references, and creation time. The app creates a UUID review URL only after the save succeeds. Anyone with that URL can read the saved note and vote; the URL itself contains no response text. Responses are anonymous and can be submitted repeatedly.

Until `DATABASE_URL` is set and the migration is applied, the UI reports that storage is unavailable instead of pretending that a response was saved.
