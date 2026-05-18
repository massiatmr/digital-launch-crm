## Objectifs

1. Définir des **templates d'emails par défaut au niveau du workspace** (1 set pour toutes les offres), puis permettre une **personnalisation par offre** qui surcharge ces défauts.
2. Rendre l'UI plus aérée : **liste cliquable** des emails (au lieu de 4 grandes cartes empilées) qui ouvre un éditeur dédié.
3. Remplacer le textarea HTML brut par un **éditeur WYSIWYG** (TipTap) avec insertion 1 clic des variables.
4. Ajouter une zone **"Envoyer un test"** dans l'éditeur : champ email + bouton qui envoie un vrai email rendu avec des valeurs d'exemple.

## Nouvelle structure de l'onglet

```text
Notifications & Rappels
├─ Card "Notifications admin"   (inchangé : switch + email workspace)
├─ Card "Emails par défaut du workspace"
│   └─ Liste cliquable des 4 types (Confirmation, 24h, 12h, 1h)
│       Chaque ligne : icône • Label • Sujet (preview) • badge "Activé/Off" • →
├─ Card "Personnalisation par offre"
│   ├─ Sélecteur d'offre
│   └─ Liste cliquable des 4 types
│       Chaque ligne : Label • Sujet (preview) • badge "Hérité workspace" ou
│       "Personnalisé" • Switch on/off • →
└─ Dialog EmailTemplateEditor  (ouvert au clic sur une ligne)
    ├─ Champ Sujet
    ├─ Barre WYSIWYG (B I U • lien • listes • H2/P • undo/redo)
    ├─ Boutons "Insérer variable" : {{name}} {{date}} {{time}} {{offer_name}}
    │   {{offer_suffix}} {{meet_link}} {{meet_block}}
    ├─ Aperçu rendu (toggle "Code / Visuel")
    ├─ Zone test :  [email test] [Envoyer un test]
    └─ Footer : [Réinitialiser au défaut]  [Annuler]  [Enregistrer]
```

## Logique de résolution des templates

Ordre de priorité côté backend (edge functions `handle-booking` et `process-booking-reminders`) :

1. `offer_booking_email_templates` (offre + type) → si présent et `enabled`
2. `workspace_booking_email_templates` (workspace + type) → si présent et `enabled`
3. `DEFAULT_TEMPLATES` (hardcodés dans l'edge function)

Si la résolution finit sur un row `enabled = false`, on **n'envoie pas** l'email (déjà le comportement actuel pour l'offre, étendu au workspace).

## Détails techniques

### Base de données (migration)

Nouvelle table `workspace_booking_email_templates` :
- `workspace_id` (fk workspaces, cascade), `type` (enum `booking_email_type`)
- `enabled` (bool, default true), `subject` (text), `body_html` (text)
- Unique `(workspace_id, type)`
- RLS : SELECT/INSERT/UPDATE/DELETE pour membres du workspace, idem que la table `offer_booking_email_templates`.

### Edge functions

- `handle-booking/index.ts` et `process-booking-reminders/index.ts` :
  ajouter le lookup workspace après le lookup offre, avant de retomber sur les defaults.
- Nouvelle edge function `send-test-booking-email/index.ts` (JWT requis) :
  body `{ subject, body_html, to, sample_vars? }`. Rend les `{{vars}}` avec des valeurs d'exemple par défaut (date du jour, heure 14:00, nom "Jean Dupont", offre "Consultation"), wrappe le HTML dans le même template que `process-booking-reminders` (`wrapHtml`), puis invoque `send-smtp-email`.

### Frontend

- Dépendances à ajouter : `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-placeholder`.
- Nouveaux fichiers :
  - `src/hooks/useBookingEmailTemplates.ts` (étendu) :
    - `useWorkspaceBookingEmailTemplates(workspaceId)`,
      `useUpsertWorkspaceBookingEmailTemplate`,
      `useResetWorkspaceBookingEmailTemplate`,
      `useSendTestBookingEmail`.
  - `src/components/bookings/EmailTemplateEditor.tsx` : Dialog réutilisable
    pour workspace ou offre (prop `scope: 'workspace' | 'offer'` + ids).
  - `src/components/bookings/WysiwygEditor.tsx` : wrapper TipTap minimal +
    toolbar + méthode `insertText` pour les variables.
  - `src/components/bookings/EmailTemplateRow.tsx` : ligne cliquable.
- `OfferEmailTemplatesEditor.tsx` : refactorisé en liste cliquable (4 lignes)
  avec badge "Hérité workspace" ou "Personnalisé" + switch on/off rapide.
- `NotificationsTab.tsx` : ajoute la card "Emails par défaut du workspace".

### Comportements UI

- Badge "Hérité workspace" : la ligne offre ne montre pas de bouton Reset
  tant que rien n'a été personnalisé. Au clic, l'éditeur s'ouvre pré-rempli
  avec le contenu hérité (workspace ou DEFAULT) ; à l'enregistrement, ça
  crée la ligne d'override.
- Reset (icône RotateCcw) supprime la ligne d'override → retour à l'hérité.
- Test d'envoi : disabled tant que `to` n'est pas un email valide ; toast
  succès/erreur ; bouton montre un spinner pendant l'envoi ; pas de save
  préalable nécessaire (le contenu courant du brouillon est envoyé).
- Variables insérées via `editor.chain().focus().insertContent('{{name}}').run()`.
- Stockage : on continue à stocker du HTML simple (le rendu actuel le supporte).
  L'éditeur produit du HTML semantically clean (TipTap par défaut).

## Hors scope

- Pas de gestion de versions / historique des templates.
- Pas de placeholders dynamiques avancés (logique conditionnelle, i18n).
- Pas de templates par canal autre qu'email (WhatsApp/SMS).
- Pas de prévisualisation "responsive mobile" — uniquement l'aperçu HTML rendu.
