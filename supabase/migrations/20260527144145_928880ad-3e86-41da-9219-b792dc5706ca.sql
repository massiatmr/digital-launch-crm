
-- 1. Tighten RLS on whatsapp_templates to be workspace-scoped
DROP POLICY IF EXISTS "Owner can select wa templates" ON public.whatsapp_templates;
DROP POLICY IF EXISTS "Owner can insert wa templates" ON public.whatsapp_templates;
DROP POLICY IF EXISTS "Owner can update wa templates" ON public.whatsapp_templates;
DROP POLICY IF EXISTS "Owner can delete wa templates" ON public.whatsapp_templates;

CREATE POLICY "Workspace can select wa templates"
ON public.whatsapp_templates FOR SELECT TO authenticated
USING (
  (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
  OR (workspace_id IS NULL AND owner_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Workspace can insert wa templates"
ON public.whatsapp_templates FOR INSERT TO authenticated
WITH CHECK (
  (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
  OR (workspace_id IS NULL AND owner_id = auth.uid())
);

CREATE POLICY "Workspace can update wa templates"
ON public.whatsapp_templates FOR UPDATE TO authenticated
USING (
  (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
  OR (workspace_id IS NULL AND owner_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Workspace can delete wa templates"
ON public.whatsapp_templates FOR DELETE TO authenticated
USING (
  (workspace_id IS NOT NULL AND public.is_workspace_owner(workspace_id, auth.uid()))
  OR (workspace_id IS NULL AND owner_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- 2. Update unique constraint on whatsapp_templates to include workspace_id
ALTER TABLE public.whatsapp_templates DROP CONSTRAINT IF EXISTS whatsapp_templates_owner_waba_name_lang_key;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_templates_ws_waba_name_lang_key
  ON public.whatsapp_templates (workspace_id, business_account_id, name, language)
  WHERE workspace_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_templates_owner_waba_name_lang_legacy_key
  ON public.whatsapp_templates (owner_id, business_account_id, name, language)
  WHERE workspace_id IS NULL;

-- 3. Update seed_default_followup_scripts to be per-workspace
CREATE OR REPLACE FUNCTION public.seed_default_followup_scripts(p_owner uuid, p_workspace uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_workspace IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.followup_scripts WHERE workspace_id = p_workspace) THEN
      RETURN;
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.followup_scripts WHERE owner_id = p_owner AND workspace_id IS NULL) THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.followup_scripts (owner_id, workspace_id, phase, title, content, sort_order) VALUES
  (p_owner, p_workspace, 'missed_appointment', 'Prospect absent au RDV',
'Salut {{name}} 👋 donc tu m''avais demandé de réserver un rdv avec moi dans le but de éventuellement mettre en place un nouveau site web pour augmenter la visibilité de l''entreprise et avoir plus de clients…

Donc je serais là pendant un petit moment aujourd''hui… voici mon num … on se reparle plus tard.', 1),

  (p_owner, p_workspace, 'no_response_3d', 'Sans réponse 3-4 jours',
'Salut {{name}}, j''ai essayé de prendre contact avec vous et j''ai laissé quelques messages ces derniers jours mais pas de retour.

Dites-moi comment vous voulez qu''on procède à partir de là ? / Que voulez-vous qu''on fasse maintenant ?

Je serai au bureau un petit moment, et si je te réponds pas directement laisse-moi juste un message et je reviendrai à toi dès que j''aurai le temps.', 2),

  (p_owner, p_workspace, 'no_response_10d', 'Sans réponse 10 jours',
'Salut {{name}} 👋 on n''a pas eu de retour depuis… avez-vous laissé tomber l''idée de régler le problème de visibilité et communication de l''entreprise… avec le site que vous vouliez mettre en place pour atteindre plus de personnes et avoir plus de clients… etc

Qu''est-ce qui s''est passé ?', 3),

  (p_owner, p_workspace, 'final_attempt', 'Dernière tentative (humour)',
'Hey {{name}} 👋 je t''ai laissé quelques vocaux et messages sans retour... donc maintenant je sais pas si tu t''es fait kidnapper par des aliens 🤣😂 ou t''as gagné la loterie et déménagé à Hawaii 😎

En tout cas avec mon agenda malheureusement pour vous ça sera ma dernière tentative de contact.

Mon numéro c''est le même +213559489424, je serai dispo un peu dans la semaine on se reparle après.', 4),

  (p_owner, p_workspace, 'final_attempt', 'Clôture du dossier',
'Salut {{name}}, j''espère que tu vas bien. J''ai pas eu de retour de ta part depuis un moment, je voulais savoir si l''idée d''avoir un système de génération de leads pour ta société n''est plus d''actualité ou peut-être c''est pas le moment…

Pour confirmer avant de clôturer le dossier, tiens-moi au courant.
Bonne journée 🙏', 5),

  (p_owner, p_workspace, 'post_offer', 'Relance après proposition',
'Salut {{name}} 👋 je voulais juste m''assurer que tu as bien reçu la proposition que je t''ai envoyée. As-tu eu le temps d''y jeter un œil ? Si tu as la moindre question, je suis dispo pour qu''on en discute ensemble.', 6);
END
$function$;
