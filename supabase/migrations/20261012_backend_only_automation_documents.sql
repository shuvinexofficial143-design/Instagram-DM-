-- Backend-only writes for automation definitions.
-- Public authenticated sessions can continue reading their own automation data
-- through existing RLS SELECT policies, but cannot bypass plan validation by
-- inserting or editing automation documents directly through the Data API.
-- Vercel /api/automations delegates writes to the account-store Edge Function,
-- which uses a server-side Supabase secret key (bypassrls) and enforces quotas.
--
-- Safe rollback if an unexpected legacy integration depends on direct writes:
-- DROP POLICY IF EXISTS autoreply_automation_backend_insert ON public.autoreply_documents;
-- DROP POLICY IF EXISTS autoreply_automation_backend_update ON public.autoreply_documents;
-- DROP POLICY IF EXISTS autoreply_automation_backend_delete ON public.autoreply_documents;

CREATE POLICY autoreply_automation_backend_insert
ON public.autoreply_documents
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (collection <> 'automations');

CREATE POLICY autoreply_automation_backend_update
ON public.autoreply_documents
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (collection <> 'automations')
WITH CHECK (collection <> 'automations');

CREATE POLICY autoreply_automation_backend_delete
ON public.autoreply_documents
AS RESTRICTIVE FOR DELETE TO authenticated
USING (collection <> 'automations');
