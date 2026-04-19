

## Cause racine de la perte de données

1. **CASCADE généralisé** : 34 FK avec `ON DELETE CASCADE` vers `workspaces`. Supprimer 1 workspace = leads, clients, offers, factures, contrats, RDV, automations, messages, scripts… tout disparaît instantanément, sans confirmation, sans corbeille.
2. **Pas de soft-delete** : aucun champ `deleted_at` nulle part. Une fois `DELETE` exécuté, c'est physique.
3. **Pas de log d'audit** : impossible de savoir QUI a supprimé QUOI ni QUAND (UI, edge function, migration ?).
4. **Pas de garde-fou UI** : aucune confirmation forte requise pour supprimer un workspace.
5. **Pas d'export/backup utilisateur** : dépendance totale aux backups Supabase Pro (que tu n'as pas).

## Stratégie : protection en 5 couches

### Couche 1 — Soft-delete sur les entités critiques (DB)

Ajouter `deleted_at TIMESTAMPTZ` sur : `workspaces`, `leads`, `clients`, `offers`, `bookings`, `invoices`, `contract_signatures`.

**Remplacer les CASCADE destructifs** par `ON DELETE RESTRICT` sur les FK `workspace_id` des tables porteuses de données métier (leads/clients/offers/invoices/contracts/bookings). Conséquence : impossible de DELETE un workspace tant qu'il contient des données → la seule voie devient le soft-delete.

Mettre à jour toutes les RLS `SELECT` existantes pour filtrer `deleted_at IS NULL` automatiquement → les données "supprimées" disparaissent de l'UI mais restent en base.

### Couche 2 — Corbeille + restauration (UI)

- Hooks `useDeleteWorkspace/Lead/Client/...` passent en `UPDATE … SET deleted_at = now()` (au lieu de DELETE).
- Nouvelle page **Paramètres → Corbeille** : liste les éléments soft-deleted des 30 derniers jours, bouton "Restaurer" (set `deleted_at = NULL`) ou "Supprimer définitivement" (vrai DELETE après double confirmation textuelle).
- Auto-purge après 30 jours via `pg_cron` (configurable).

### Couche 3 — Confirmations fortes pour actions destructives (UI)

Pour supprimer un workspace : dialog qui exige de **taper le nom exact du workspace** + résumé de l'impact ("Cette action déplacera 47 leads, 12 clients, 8 factures vers la corbeille").

Idem pour suppression définitive depuis la corbeille.

### Couche 4 — Journal d'audit (DB)

Nouvelle table `audit_log` (workspace_id, user_id, action, entity_type, entity_id, snapshot_jsonb, created_at). Triggers `AFTER INSERT/UPDATE/DELETE` sur workspaces/leads/clients/offers/invoices/contracts qui enregistrent un snapshot JSONB de la ligne avant suppression. Permet :
- Savoir qui a fait quoi
- **Restaurer manuellement** depuis le snapshot même après purge

Page **Paramètres → Historique** (admin) qui liste les 90 derniers jours d'événements destructifs avec bouton "Restaurer depuis snapshot".

### Couche 5 — Export & backup utilisateur

- Bouton **"Exporter mon workspace"** dans Paramètres → Mon compte : génère un ZIP JSON (leads, clients, offres, factures, contrats, automations) téléchargeable. Pas de dépendance plan Pro.
- Edge function `weekly-backup` (cron hebdomadaire) qui envoie le ZIP par email à l'owner du workspace. Coffre-fort hors-ligne automatique.

## Comportement final

| Scénario | Avant | Après |
|---|---|---|
| Click "Supprimer workspace" | DELETE cascade silencieux, tout perdu | Doit taper le nom + confirmation, soft-delete vers corbeille |
| Bug code / migration foireuse | Données perdues | CASCADE bloqué par RESTRICT, erreur SQL visible |
| Suppression accidentelle d'un lead | Perdu | Restaurable depuis corbeille pendant 30j |
| Purge automatique 30j | N/A | Snapshot conservé 90j dans audit_log → restauration manuelle possible |
| Catastrophe totale | Aucun recours | Backup ZIP hebdo dans la boîte mail |

## Fichiers touchés (ordre d'implémentation)

| Étape | Fichiers / Migrations |
|---|---|
| 1. Migration soft-delete | `deleted_at` sur 7 tables, RLS mises à jour, FK CASCADE→RESTRICT sur workspace_id |
| 2. Migration audit | Table `audit_log`, triggers AFTER sur tables critiques, RPC `restore_from_snapshot(snapshot_id)` |
| 3. Hooks data | `useLeadData`, `useClientData`, `useOfferData`, `useWorkspaces` → DELETE remplacés par UPDATE deleted_at |
| 4. UI corbeille | `src/pages/SettingsTrashPage.tsx` + entrée sidebar Paramètres |
| 5. UI historique admin | `src/pages/SettingsAuditPage.tsx` (visible seulement aux admins) |
| 6. UI suppression workspace | Refonte du bouton dans `SettingsWorkspacesPage.tsx` avec input texte de confirmation |
| 7. Export ZIP | Bouton dans `SettingsAccountPage.tsx` + edge function `export-workspace` |
| 8. Backup hebdo | Edge function `weekly-backup` + cron pg_cron + email avec pièce jointe |
| 9. Cron purge | Cron quotidien qui DELETE les rows `deleted_at < now() - 30 days` |

## Notes techniques

- Les RLS modifiées doivent garder l'accès admin au filtrage (admins peuvent voir la corbeille).
- L'export ZIP doit exclure les secrets (tokens Google, page access tokens Meta).
- Le snapshot JSONB est volontairement dénormalisé → permet restauration même si schéma change.
- Migration FK CASCADE→RESTRICT : tester sur un workspace de test d'abord, peut révéler des incohérences à nettoyer.

