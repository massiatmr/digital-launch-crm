## Refonte de la page Paramètres

Actuellement, la page Settings a 5 onglets: Espaces, Automatisation, Intégrations, Tests, Invitations. Il manque une vraie section **"Mon Compte"** (profil perso, sécurité, notifications) et la structure mélange admin global / réglages workspace / config personnelle.

## Nouvelle structure ( onglets, regroupés par scope)

```text
👤 PERSONNEL          🏢 WORKSPACE              
├ Mon compte 
Espaces        ├                                
└ Notifications
Invitations.         ├ Automatisation           
                     └ Intégrations
                      Espaces
```

### 1. **Mon compte** (NOUVEAU — onglet par défaut)

Infos perso de l'utilisateur connecté, indépendantes du workspace.

- **Profil** : email (lecture seule), nom complet (`owner_profiles.legal_name`), téléphone, avatar/logo perso
- **Identité légale** (utilisée pour factures/contrats) : `company_name`, `siret`, `vat_number`, `address`
- **Branding email** : `email_sender_name`, `email_signature`, `brand_color`
- **Sécurité** :
  - Changer le mot de passe (`supabase.auth.updateUser({ password })`)
  - Changer l'email (avec re-confirmation)
  - Bouton "Déconnecter toutes les sessions"
  - Bouton "Supprimer mon compte" (danger zone, avec confirm)
- Sauvegarde via `useUpdateOwnerProfile` (déjà existant)

### 2. **Notifications** (NOUVEAU)

- Toggle push web (réutilise `EnablePushButton` + `usePushNotifications`)
- Statut PWA : installée / à installer (réutilise `PwaInstallGuide`)
- Préférences emails : nouveau lead, nouveau RDV, signature reçue (toggles → champs sur `owner_profiles` ou nouvelle table `notification_preferences`)
- Liste des appareils connectés (push subscriptions actives) avec bouton "Révoquer"

### 3. **Espaces de travail** (existant, conservé)

Liste workspaces, création, membres, modules. **Ajouts** :

- Champ "Email de notification du workspace" (`workspaces.notification_email`) éditable par owner
- Édition `company_name` / `slug` / `logo_url` du workspace courant (pas seulement à la création)

### 4. **Automatisation** (existant, conservé)

Inchangé — déjà workspace-scoped depuis le dernier patch.

### 5. **Intégrations** (existant, conservé)

Inchangé — Meta/WhatsApp/Google Calendar.

### 6. **Tests** + **7. Invitations** (admin only, fusionnés visuellement)

Onglet "Système" qui n'apparaît QUE si `useIsAdmin()` retourne true. Contient sous-sections Tests + Invitations globales.

## UX

- Layout sidebar verticale à gauche (au lieu des tabs horizontales actuelles) sur desktop, plus lisible avec 6 sections. Sur mobile : Select dropdown en haut.
- Header de chaque section : icône + titre + courte description
- Section "danger zone" en bas de Mon compte avec bordure destructive
- Toast confirmation systématique sur save

## Fichiers touchés


| Fichier                                   | Action                                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| `src/pages/SettingsPage.tsx`              | Refonte layout : sidebar verticale, nouvelles routes                                     |
| `src/pages/SettingsAccountPage.tsx`       | **NOUVEAU** — profil, identité, sécurité                                                 |
| `src/pages/SettingsNotificationsPage.tsx` | **NOUVEAU** — push, emails, devices                                                      |
| `src/pages/SettingsWorkspacesPage.tsx`    | Ajout édition workspace (nom/slug/logo/notification_email)                               |
| `src/App.tsx`                             | Routes `/settings/account`, `/settings/notifications`                                    |
| `src/components/AppSidebar.tsx`           | Lien "Paramètres" pointe vers `/settings/account` par défaut                             |
| Migration SQL                             | Ajout `notification_preferences` JSONB sur `owner_profiles` (nouveau lead/RDV/signature) |


## Comportement final

- Clic sur "Paramètres" → arrive sur **Mon compte** (le plus utile au quotidien)
- 6 sections claires, regroupées par scope (perso / workspace / admin)
- Plus besoin de chercher où changer son mot de passe ou activer les notifications
- Édition complète du workspace (pas seulement à la création)