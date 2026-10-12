# n8n AI generation workflow (non-production scaffold)

This folder is the integration staging area. Do not import or activate a workflow until its authentication, schema validation, response contract and error handling are implemented and tested.

Target flow: signed internal webhook -> validate signature / request age -> accept sanitized prompt, last messages and model allowlist -> generate AI text -> return structured reply. All Instagram Meta API calls, typing, quota and message sending stay in existing Supabase Edge Function.

Deployment: n8n requires an active compute runtime, not Supabase Storage. Prefer separate n8n PostgreSQL and aggressive execution-data pruning. The 500 MB Supabase database allowance should not store n8n execution history.

Per 20 customers: use deterministic server-side group assignment. Each execution remains independent, and group separation does not guarantee lower latency.
