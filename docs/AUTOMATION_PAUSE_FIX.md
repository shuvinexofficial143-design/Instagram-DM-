# Durable automation and conversation pause

A completed webhook used to write its entire automation snapshot when incrementing statistics. If the owner paused or edited that rule while the reply was being generated, the late statistics update could restore the old active status or prompt.

Delivery counters now use a private atomic PostgreSQL function that updates only statistics on the latest row. Status switches use a separate verified, workspace-scoped PATCH that modifies only status. Old reads cannot override a confirmed switch, and the switch is disabled while saving. Preview messages never save live automation configuration or delivery counters.

Before each automated Meta dispatch, a private database reservation checks the latest automation status and that Instagram credentials still exist. AI dispatch also checks the conversation's durable takeover control. The initial event preparation reads this control too, so new messages during takeover are saved to Inbox without starting another AI turn. Messages already accepted by Meta cannot be recalled by toggling OFF.

Takeover controls are stored in `autoreply_documents` under `ai_thread_controls`, keyed by the customer's messaging-scoped Instagram sender ID and scoped to the workspace's existing RLS. They survive reloads and username changes. Manual replies persist takeover before contacting Meta; only an explicit Resume AI clears it.

Validation includes webhook pause/disconnect during generation, stale browser responses, reload/resume, multiple connected accounts, API ownership checks, and `tests/automation-pause.integration.sql`. The SQL fixture rolls back synthetic account, automation, quota and claim rows.
