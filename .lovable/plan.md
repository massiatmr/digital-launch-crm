

## Plan : transformer le CRM en outil multi-tenant (sur invitation)

**Objectif** : permettre à plusieurs owners d'utiliser le CRM, chacun avec son branding, ses configs et ses pages d'offres isolées. Accès par invitation uniquement.

### 1. Système d'invitations

Nouvelle table `invitations` (email, token, invited_by, expires_at, used_at).
- Page `/auth` : signup désactivé par défaut, accessible uniquement via lien `/auth?invite=<token>`
- Page admin `/settings/invitations` (visible uniquement à toi via une table `app_admins`) pour générer/révoquer des invites
- Edge function `send-invitation` qui génère le token et envoie l'email d'invite (via SMTP existant)

### 2. Profil owner (branding + config entreprise)

Nouvelle table `owner_profiles` (un par user) avec :
- `company_name`, `legal_name`, `siret`, `vat_number`, `address`, `email`, `phone`
- `logo_url` (upload Storage), `signature_url`
- `slug` unique (pour les URLs publiques d'offres → `/o/:slug/:offerSlug`)
- `brand_color`, `email_sender_name`, `email_signature`

Migration des PDFs (`generateContractPDF`, `generateInvoicePDF`) et du logo (`logoBase64`) pour lire dynamiquement depuis `owner_profiles` au lieu du hardcode "Digital Launch LLC".

### 3. Wizard d'onboarding (3-4 étapes après signup)

Nouvelle route `/onboarding` (forcée tant que `owner_profiles.completed = false`) :
1. **Entreprise** : nom, logo, infos légales, slug
2. **Première offre** : nom, prix, description (crée une `offers` row)
3. **Connexions** (optionnelles, skippables) : WhatsApp Cloud, Meta Lead Ads, Google Calendar
4. **Démo** : checkbox "Pré-remplir avec données démo" → seed 3 leads + 1 client + 2 bookings d'exemple via une edge function `seed-demo-data`

### 4. Isolation multi-tenant

**Slug par owner pour pages publiques** :
- Routes publiques actuelles `/offers/:slug/page` → migrer vers `/o/:ownerSlug/:offerSlug` pour éviter les collisions
- RLS `offers` côté anon : filtrer par `owner_slug` correspondant à l'URL
- Garder rétrocompat si possible (redirect)

**Configs déjà isolées par `owner_id`** : `whatsapp_config`, `meta_pages`, `google_tokens`, `followup_automation_settings`, `whatsapp_templates` → juste valider end-to-end qu'un nouvel owner peut tout configurer sans collision.

**Templates emails par owner** : ajouter `email_sender_name` + `email_signature` dans `owner_profiles`, lire dans `send-transactional-email` pour personnaliser le From et le footer.

### 5. Sécurité (admin role)

Pour l'écran d'invitations admin :
- Table `user_roles` (id, user_id, role enum 'admin'|'user') + fonction `has_role(uuid, app_role)` security definer
- Toi seul es admin (insert manuel de ta row)
- RLS sur `invitations` : admin only

### 6. Adaptations UI

- Garde sur `App.tsx` : si user authentifié sans `owner_profiles.completed` → redirect `/onboarding`
- Settings : nouvelle section "Mon entreprise" pour éditer le profil après onboarding
- Sidebar : afficher `owner_profiles.company_name` + logo en haut au lieu du logo Digital Launch fixe

### Diagramme

```text
Invite email
   ↓
/auth?invite=<token>  → signup
   ↓
/onboarding (wizard 4 étapes)
   ↓ (crée owner_profiles + offer + optionnellement seed démo)
/  (pipeline)
   ↓
Pages publiques: /o/<owner_slug>/<offer_slug>
PDFs & emails: branding lu depuis owner_profiles
```

### Détails techniques

- **Migrations SQL** : `invitations`, `owner_profiles`, `user_roles`, ajout `owner_slug` index, fonction `has_role`, RLS associées
- **Edge functions nouvelles** : `send-invitation`, `seed-demo-data`, `accept-invitation` (valide token, crée user)
- **Edge functions modifiées** : `send-transactional-email` (lire branding owner), `handle-booking` (URL publique avec owner_slug)
- **Code client** : nouveau composant `OnboardingWizard`, nouveau hook `useOwnerProfile`, refactor `logoBase64`/`signatureBase64` → fetch dynamique, refactor PDFs
- **À noter** : les emails transactionnels personnalisés ne marcheront pleinement qu'une fois le DNS configuré (bloqueur connu) — le code sera prêt mais les envois peuvent rester bloqués jusqu'au DNS

### Découpage suggéré (3 itérations)

1. **Fondations** : tables (`invitations`, `owner_profiles`, `user_roles`), wizard onboarding minimal, garde de redirection — sans démo data ni branding PDF
2. **Branding & isolation** : refactor PDFs/logo dynamiques, slug owner sur pages publiques, templates emails personnalisés
3. **Invitations & démo** : page admin `/settings/invitations`, edge function `send-invitation`, `seed-demo-data`

