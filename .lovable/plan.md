

## Problèmes identifiés dans le flow actuel

1. **Double création workspace pour les invités** : le trigger `handle_new_user` crée TOUJOURS un workspace "Mon espace" à chaque signup, même quand l'utilisateur est invité. Résultat : un invité se retrouve avec 2 workspaces et passe par l'onboarding alors qu'il rejoint juste une boîte existante.

2. **Consume invitation cassé avec confirmation email** : `consume_workspace_invitation` est appelé immédiatement après `signUp()`, mais avec confirmation email obligatoire `getUser()` renvoie null → invitation perdue. Quand l'user clique sur le lien email, il revient sans `?invite=` dans l'URL → atterrit dans le mauvais workspace.

3. **OnboardingGuard force tout le monde** : même les invités qui rejoignent un workspace déjà configuré doivent compléter le wizard.

4. **"Mot de passe oublié" inactif** : bouton présent mais sans handler, pas de page `/reset-password`.

5. **Google OAuth inactif** : bouton présent mais sans handler.

6. **Email d'invitation manuel** : aujourd'hui l'admin doit copier-coller le lien à la main, aucun email n'est envoyé.

## Plan

### A. Fixer `handle_new_user` (migration)
Refonte du trigger SQL :
- Toujours créer `owner_profiles` (paramètres légaux/perso individuels)
- **Ne créer un workspace par défaut QUE si aucune invitation valide n'existe pour cet email**
- Stocker `invite_token` dans `raw_user_meta_data` au signup pour que le trigger sache

### B. Auto-consume invitation après confirmation email (migration)
- Au `signUp` : passer `options.data: { invite_token }` → stocké dans user_metadata
- Nouveau trigger `on_auth_user_confirmed` (sur `auth.users` UPDATE de `email_confirmed_at`) qui appelle `consume_workspace_invitation` automatiquement avec le token en metadata
- Robuste : peu importe quand l'user clique sur le lien email, l'invitation est consumée

### C. OnboardingGuard intelligent
Si l'user appartient à un workspace **dont il n'est pas le créateur** → bypass le wizard, redirect direct sur `/`. Le wizard ne sert qu'aux créateurs de workspace.

### D. AuthPage améliorée
- **Mot de passe oublié** : modal email → `resetPasswordForEmail()` avec `redirectTo: /reset-password`
- **Google OAuth** : `signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/auth' + (inviteToken ? '?invite=...' : '') } })`
- Persistance du `invite` token dans `localStorage` (récupéré post-confirmation email si l'user revient sans le token dans l'URL)
- Si déjà connecté + `?invite=` → consume direct + switch sur le workspace rejoint
- Message clair après signup : "Vérifie ton email puis reviens te connecter"

### E. Page `/reset-password` (nouvelle, publique)
Détecte le hash `#type=recovery` → formulaire nouveau password → `supabase.auth.updateUser({ password })` → redirect `/`.

### F. Email d'invitation transactionnel
- Nouveau template `workspace-invitation` (React Email, sobre, avec nom du workspace + bouton CTA)
- `send-invitation` edge function envoie automatiquement l'email via `send-transactional-email` à l'invité
- L'admin copie plus de lien à la main

### G. UX globale
- Switch automatique sur le workspace rejoint après consume (côté client, post-login)
- Toast clair : "Tu as rejoint [Workspace] avec succès"

## Fichiers touchés

| Fichier | Action |
|---|---|
| Migration SQL | Refonte `handle_new_user`, ajout trigger `on_auth_user_confirmed`, fonction `consume_invitation_from_metadata` |
| `src/pages/AuthPage.tsx` | Google OAuth, reset password modal, persistance invite, déjà-loggé+invite |
| `src/pages/ResetPasswordPage.tsx` | NOUVEAU |
| `src/components/OnboardingGuard.tsx` | Skip wizard si membre d'un workspace non créé par soi |
| `src/App.tsx` | Route `/reset-password` |
| `supabase/functions/send-invitation/index.ts` | Envoi email transactionnel après création |
| `supabase/functions/_shared/transactional-email-templates/workspace-invitation.tsx` | NOUVEAU template |
| `supabase/functions/_shared/transactional-email-templates/registry.ts` | Enregistrer le template |

## Comportement final

- **Inscription publique normale** : signup → email confirmation → login → wizard onboarding (créer son workspace) → app
- **Invité par admin** : reçoit email avec CTA → clic → `/auth?invite=TOKEN` → signup OU login (Google/email) → email confirmation auto-consume l'invitation → arrive directement dans le workspace rejoint, pas de wizard
- **Mot de passe oublié** : flow complet fonctionnel
- **Google OAuth** : login/signup en 1 clic, compatible invitations

