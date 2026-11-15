# SearchX analytics

Create a dedicated **SearchX** Mixpanel project in Organization Settings → Projects → Create Project. In that project, open Project Settings → Access Keys and copy its **Project Token**. Set `MIXPANEL_TOKEN` to that value in the SearchX Vercel project's Settings → Environment Variables for **Production**, then redeploy. Set `MIXPANEL_REGION=EU` there too if the Mixpanel project uses EU data residency; otherwise the default is US. The token is a client-side project identifier, not a Mixpanel API secret. Never put an API secret or service-account credential in this variable. Without a valid token, the site sends no analytics events. The application uses the [official Mixpanel browser SDK](https://github.com/mixpanel/mixpanel-js) from Mixpanel's CDN and loads it only when configured.

The client honors Global Privacy Control and Do Not Track. Autocapture, replay, automatic page views, IP geolocation, and raw URL/referrer capture are disabled. The server reads Vercel's country header and sends only the two-letter country code. UTM values are length- and character-limited. The referrer is reduced to its hostname. Only recognized public catalog identifiers appear as search query values; arbitrary free text, coordinates, and AI prompts are excluded. Search starts and no-result events still include a type/reason so the funnel remains useful.

## Event taxonomy

| Event | Meaning | Key properties |
| --- | --- | --- |
| `Session Started` | New tab session after 30 minutes without interaction | `session_id`, `visitor_type`, attribution |
| `Page Viewed` | One actual page load | `page`, `session_id`, `visitor_type` |
| `Page Engagement` | Visible, recently active time, emitted in whole seconds | `page`, `active_seconds`, `session_id` |
| `Search Started` | First nonempty search input in an intent | `page`, `session_id` |
| `Search Submitted` | A submitted query or chosen suggestion | `search_id`, `search_kind`, optional safe `query`, `follow_up` |
| `Search Results Shown` | Local or resolved catalog results | `search_id`, `result_count`, `result_source` |
| `Search No Results` | A definitive catalog miss | `search_id`, `reason` |
| `Result Selected` | Suggestion, shortcut, or map source opened | `search_id` where applicable, `result_source`, optional `object_id`, `object_type` |
| `Object Explored` | Object panel opened | `catalog`, `object_type`, optional `object_id` |
| `Observation Viewed` | User opened the observation stage | `object_id` |
| `Learning Question Answered` | A quiz answer | `question_number`, `correct`, `object_id` |
| `Feature Used` | Explicit use of a named map/player control | `feature`, optional `detail` |

The SDK's anonymous distinct ID supports unique users, DAU/WAU, returning visitors, and retention. Count `Search Submitted` for search frequency and repeat searches. Count unique `session_id` values for sessions. Sum `Page Engagement.active_seconds` for active time; do not treat it as a continuous timer. Page/session elapsed time can be estimated from first/last events, but a one-page visit with no later event has no reliable elapsed duration. `Search No Results` excludes service errors so it does not misstate catalog coverage. `follow_up` on `Search Submitted` identifies search after selection.

## Suggested Mixpanel reports

After the SearchX project is accessible, create a product board with page views, unique users, DAU/WAU, searches per user, top safe query and object IDs, no-result rate, active seconds, and feature usage. Create a journey funnel: `Search Submitted` → `Search Results Shown` → `Result Selected` → `Object Explored` → `Search Submitted` filtered to `follow_up=true`. Create a marketing board with `Session Started` broken down by `utm_source`, `utm_medium`, `utm_campaign`, `referrer_domain`, and `country`, plus conversion to `Result Selected` and a 7-day retention report. Filter both boards to `site_environment=production` if development tokens are ever used.

To verify a configured deployment, open `https://searchx.earth/analytics-config` and confirm a token is present without copying it into logs. In Mixpanel Live View, load `/`, follow the link to `/observatory`, search `M 42`, select a result, and open Observe. Confirm one `Page Viewed` per navigation, one `Search Submitted` per submission, and linked `search_id` values. In browser network tools, confirm no raw free-text query, full URL, IP address, or coordinates appear in tracked event properties. Do not use a real user profile or sensitive search to test.
