# Transformer le CRM en plateforme multi-tenant SaaS

Objectif : passer d'un CRM mono-utilisateur (toi seul) à une plateforme où tu gères plusieurs entreprises clientes, chacune avec ses propres users, rôles, page Facebook et WhatsApp.

## Architecture multi-tenant

**Modèle : Organisations (workspaces)**

- Une `organization` = une entreprise cliente
- Chaque user appartient à une ou plusieurs organisations via `organization_members` avec un rôle
- Toutes les données métier (leads, clients, offers, bookings, whatsapp_config, meta_pages, followups…) sont scopées par `organization_id` au lieu de `owner_id`
- Toi = `super_admin` global, accès à toutes les organisations + console admin

```text
super_admin (toi)
   └── organizations (entreprises clientes)
         ├── members (users avec rôles)
         ├── leads, clients, offers, bookings…
         ├── whatsapp_config (1 par org)
         ├── meta_pages (FB pages de l'org)
         └── followup_sequence_steps
```

## Rôles

- `super_admin` — toi, accès global + console `/admin`
- `owner` — propriétaire de l'org cliente (gère membres, intégrations, facturation)
- `admin` — gère leads/clients/automations
- `member` — utilise le CRM (leads, conversations, RDV) sans toucher aux réglages
- `viewer` — lecture seule

Stockés dans `organization_members(user_id, organization_id, role)` — **jamais** sur `profiles`. Fonction `has_org_role(user, org, role)` `SECURITY DEFINER` pour les RLS (évite la récursion).

## Plan d'implémentation

### 1. Base de données

- Nouvelles tables : `organizations`, `organization_members`, `organization_invitations`
- Enum `org_role` + enum global `app_role` (avec `super_admin`) + table `user_roles`
- Ajouter `organization_id` à toutes les tables métier (leads, clients, offers, bookings, whatsapp_config, meta_pages, whatsapp_templates, whatsapp_messages, followup_*, lead_followup_tasks, reminders, generated_invoices, generated_contracts, client_resources, client_activities, onboarding_responses, lead_activities, push_subscriptions…)
- Backfill : créer une org "Digital Launch" avec toi comme `owner`, copier `organization_id` partout depuis `owner_id`
- Garder `owner_id` (créateur de l'enregistrement) mais l'isolation se fait sur `organization_id`
- Réécriture complète des RLS via `has_org_role()` + restrictions selon le rôle pour write/delete/settings

### 2. Auth & contexte org côté front

- Table `profiles` avec `active_organization_id`
- Hook `useOrganization()` : liste des orgs du user + org active + switch
- Hook `useRole()` : rôle dans l'org active
- `<OrgGuard requiredRole="admin">` pour protéger des sections
- Sélecteur d'organisation en haut de la sidebar (et mobile nav)
- Tous les hooks data (`useLeadData`, `useClientData`, `useOfferData`…) filtrent automatiquement sur l'org active

### 3. Console super-admin (`/admin`)

- Visible uniquement si `super_admin`
- Liste de toutes les organisations (recherche, statut actif/suspendu, dernière activité, volume leads)
- Création d'une org cliente : nom + email owner → invitation par magic link
- Détail org : membres, intégrations connectées (FB/WA), suspendre/réactiver
- "Voir comme" : switcher temporairement sur l'org pour debug

### 4. Gestion des membres (`/settings/team`)

- Pour `owner`/`admin` de l'org
- Liste des membres avec rôle, dernière connexion
- Inviter par email (token + magic link → rejoint l'org au signup/login)
- Changer rôle / retirer membre
- Table `organization_invitations(email, organization_id, role, token, expires_at)`

### 5. Intégrations par org

- **WhatsApp** : `whatsapp_config` devient 1 par org. UI inchangée, scope = org active
- **Facebook** : `meta_pages` liées à l'org. Le callback `facebook-auth-callback` encode l'org dans le `state` (`${user_id}:${org_id}`)
- **Webhooks publics** (whatsapp/facebook) : routent vers la bonne org via `phone_number_id` / `page_id` → `organization_id`
- **Edge functions** (`send-whatsapp-message`, `whatsapp-webhook`, `facebook-webhook`, `process-followup-tasks`, `detect-inactive-conversations`, `handle-booking`, `notify-new-lead`…) : remplacer `owner_id = X` par `organization_id = X`, en récupérant l'org via le lead/config concerné

### 6. UI

- Sélecteur d'org en haut de sidebar + mobile nav (badge "Admin" si super_admin)
- Badge rôle dans l'avatar user
- Masquer/désactiver actions selon rôle (ex : `viewer` ne peut pas créer de lead, `member` ne peut pas modifier `whatsapp_config`)
- Nouvelles pages : `/settings/team` et `/admin` (super_admin only)
- Dashboard adapté à l'org courante

### 7. Facturation/plans (phase 2 — optionnel)

- Champ `plan` sur `organizations` + limites (nb leads/mois, nb membres)

## Points d'attention techniques

- **Migration sans casse** : créer l'org "Digital Launch" et backfill toutes les tables avec son `id` à partir de `owner_id = ton user_id`, puis activer les nouvelles RLS
- **RLS** : utiliser `has_org_role()` `SECURITY DEFINER` pour éviter la récursion infinie
- **Webhooks publics** : pas de JWT, ils résolvent l'org via les identifiants Meta — bien sécuriser (jamais d'exposition cross-org)
- **Edge functions JWT** : extraire `organization_id` depuis un header custom `x-organization-id` ou depuis `profiles.active_organization_id`
- **Realtime** : channels filtrés par `organization_id`
- **OneSignal** : tag `organization_id` pour cibler les notifs

## Ordre de réalisation

1. Migration DB (orgs, members, roles, `organization_id` partout, backfill)
2. RLS réécrites avec `has_org_role`
3. Hooks `useOrganization` / `useRole` + sélecteur d'org dans la sidebar
4. Mise à jour de tous les hooks data pour filtrer sur l'org active
5. Page `/settings/team` (invitations + gestion membres)
6. Console super-admin `/admin`
7. Mise à jour des edge functions (webhooks + automations) pour scope par org
8. UI : masquage selon rôle, badges, restrictions
9. Tests end-to-end multi-tenant

## Quelques questions avant de coder

1. **Multi-org par user** : 1 user = 1 org (plus simple). et le superadmin à accès à tous
2. **Création des comptes clients** : tu crées l'org + invites l'owner par email depuis `/admin`, ou tu veux aussi un signup public auto-validé ?
3. **Set de rôles** : plus simple (juste `owner` / `member`) ?
4. **Intégrations** : chaque org connecte sa propre page FB et son propre WhatsApp Business 