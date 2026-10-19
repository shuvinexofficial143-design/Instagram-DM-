# Private administrator access

Set `ADMIN_EMAILS` in the Vercel project's **Settings → Environment Variables** for the required environment. Use the verified Google/login email, or a comma-separated list. Save and redeploy after changing it. For a local server, supply the same variable through the runtime's private environment.

Keep the value out of Git and browser variables such as `VITE_*`. The example file intentionally has an empty value. An empty allowlist grants nobody access. Access checks, overview, plan changes and support administration validate the real session against this policy. The browser receives only its own access result, never the allowlist.

Supabase administrator operations accept only short-lived, action-bound signed requests from the server. These use the existing private Instagram app secret on both services. No second administrator-email setting in Supabase is required.

Disconnecting Instagram removes its stored credentials while preserving the account workspace, inbox and customer tables. A preserved profile does not indicate a connected account. Reconnecting through official OAuth restores the same workspace.
