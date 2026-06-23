## Objectif

Permettre d'envoyer un message WhatsApp template (HSM approuvé Meta) en une fois à plusieurs leads/clients, soit en les cochant un par un, soit en les ciblant via filtres (statut pipeline, score, source, offre, état conversation, dernière relance, etc.).

## Parcours utilisateur

Nouvelle page **Campagnes WhatsApp** (`/campaigns`), accessible depuis la sidebar (icône mégaphone) sous "Conversations".

1. **Étape 1 — Audience** : 2 onglets
   - *Sélection manuelle* : tableau filtrable (recherche, source, statut, score, offre) avec checkbox par ligne + "tout sélectionner sur la page filtrée"
   - *Ciblage par filtres* : combinaisons de critères → preview du nombre de destinataires en temps réel
     - Type : leads / clients / les deux
     - Statut lead (`new`, `contacted`, `qualified`, `lost`…) ou statut client
     - Score (`hot`, `warm`, `cold`)
     - Source (facebook, website, messenger…)
     - Offre liée
     - État conversation (`NEW`, `CONTACTED`, `QUALIFIED`, `BOOKED`, `CLOSED`)
     - Dernière activité (>X jours sans réponse, jamais contacté…)
     - Exclure ceux dans la fenêtre 24h active (déjà en conversation) ou au contraire les inclure pour envoi free-form
     - Exclure ceux ayant un rappel/relance automatique en cours
2. **Étape 2 — Message** : choix du template HSM approuvé (liste depuis `whatsapp_templates`), preview avec variables mappées sur les champs lead (`{{1}} = name`, etc.), sélection de la langue.
3. **Étape 3 — Récap & envoi** : nombre final de destinataires, coût estimé (info), bouton "Envoyer maintenant" ou "Programmer pour…". Bouton "Test sur un numéro" avant lancement.
4. **Étape 4 — Suivi** : après envoi, vue détail de la campagne avec liste des destinataires + statut (queued / sent / delivered / read / failed + raison), bouton "Renvoyer aux échecs", export CSV.

## Architecture technique

### Base de données (migration)

```text
campaigns
  id, workspace_id, owner_id, name, channel='whatsapp',
  template_id (fk whatsapp_templates), template_language,
  template_variables_mapping jsonb,  -- {"1":"name","2":"company_name"}
  audience_mode ('manual'|'filter'),
  audience_filter jsonb,             -- snapshot des critères
  scheduled_at, started_at, finished_at,
  status ('draft'|'scheduled'|'running'|'completed'|'cancelled'|'failed'),
  total_recipients, sent_count, delivered_count, read_count, failed_count,
  created_at, updated_at

campaign_recipients
  id, campaign_id, lead_id (nullable), client_id (nullable),
  phone, resolved_variables jsonb,
  status ('pending'|'sent'|'delivered'|'read'|'failed'|'skipped'),
  wa_message_id (fk whatsapp_messages),
  error_message, sent_at, updated_at
  unique(campaign_id, phone)
```

GRANTs + RLS workspace-scoped (membres workspace en lecture, owner en écriture).

### Edge Functions

- `campaigns-preview-audience` (POST) : retourne le count + 20 premiers contacts pour un set de filtres, sans rien écrire.
- `campaigns-launch` (POST) : valide la campagne, matérialise les destinataires dans `campaign_recipients`, passe en `scheduled` ou `running`, déclenche `campaigns-process` immédiatement si pas de `scheduled_at`.
- `campaigns-process` (cron 1 min) : prend les campagnes `running` ou `scheduled` dues, traite par batch de 50 destinataires `pending`, appelle l'API WhatsApp Cloud Meta (template message), insère dans `whatsapp_messages` (direction outbound, kind=`template`), met à jour `campaign_recipients.status`, throttle pour rester sous les limites Meta. Met à jour les compteurs de la campagne.
- Webhook existant `meta-webhook` : on étend pour propager les statuts `delivered`/`read`/`failed` vers `campaign_recipients` via `wa_message_id`.

### Frontend

- `src/pages/CampaignsPage.tsx` (liste + bouton "Nouvelle campagne")
- `src/pages/CampaignBuilderPage.tsx` (wizard 3 étapes avec `Stepper`)
- `src/pages/CampaignDetailPage.tsx` (suivi destinataires temps réel via Realtime sur `campaign_recipients`)
- Composants : `AudienceManualPicker`, `AudienceFilterBuilder`, `TemplatePicker` (réutilise le picker WhatsApp existant), `TemplateVariableMapper`, `CampaignRecipientsTable`
- Route + entrée sidebar dans `src/components/AppSidebar.tsx`
- Hook `useCampaigns` (CRUD + Realtime)

### Garde-fous

- Bloquer l'envoi si `whatsapp_config.status != 'connected'` pour le workspace.
- Refuser les templates non `approved` côté Meta.
- Anti-spam : refuser une campagne ciblant un lead ayant déjà reçu le **même** template dans les 24h.
- Limite max 5 000 destinataires par campagne (configurable).
- Dry-run obligatoire activé par défaut pour la 1ère campagne d'un workspace.
- Soft-delete + audit log via trigger existant `log_entity_changes`.

## Hors scope (V2)

- A/B testing entre 2 templates
- Compagnes Messenger / Instagram (même schéma, autre canal)
- Suivi clics sur boutons CTA du template

Je peux démarrer l'implémentation dès validation.
