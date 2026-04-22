
-- Phase enum
DO $$ BEGIN
  CREATE TYPE public.followup_script_phase AS ENUM (
    'missed_appointment',
    'no_response_3d',
    'no_response_10d',
    'final_attempt',
    'post_offer',
    'custom'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.followup_scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  phase public.followup_script_phase NOT NULL DEFAULT 'custom',
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_followup_scripts_workspace ON public.followup_scripts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_followup_scripts_owner ON public.followup_scripts(owner_id);

ALTER TABLE public.followup_scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace can select followup_scripts"
  ON public.followup_scripts FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Workspace can insert followup_scripts"
  ON public.followup_scripts FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND (workspace_id IS NULL OR public.is_workspace_member(workspace_id, auth.uid()))
  );

CREATE POLICY "Workspace can update followup_scripts"
  ON public.followup_scripts FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Workspace can delete followup_scripts"
  ON public.followup_scripts FOR DELETE TO authenticated
  USING (
    owner_id = auth.uid()
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE OR REPLACE FUNCTION public.touch_followup_scripts_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_touch_followup_scripts ON public.followup_scripts;
CREATE TRIGGER trg_touch_followup_scripts
BEFORE UPDATE ON public.followup_scripts
FOR EACH ROW EXECUTE FUNCTION public.touch_followup_scripts_updated_at();

-- Seed function : crée les scripts par défaut pour un owner s'il n'en a aucun
CREATE OR REPLACE FUNCTION public.seed_default_followup_scripts(p_owner uuid, p_workspace uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.followup_scripts WHERE owner_id = p_owner) THEN
    RETURN;
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
END $$;
