

## Plan: Ouvrir les details du lead en slide-over depuis le pipeline

### Ce qu'on fait
Quand on clique sur une carte lead dans le pipeline, au lieu de naviguer vers `/leads/:id`, on ouvre un **Sheet (panneau lateral)** avec tous les details du lead (analyse IA, messages, scripts, contact) -- sans quitter la vue pipeline. Le drag & drop continue de fonctionner normalement.

### Comment
1. **Extraire le contenu de LeadDetailPage** dans un composant reutilisable `LeadDetailContent` qui accepte un `leadId` en prop (sans le layout/retour)
2. **Modifier PipelinePage** :
   - Ajouter un state `selectedLeadId`
   - Au clic sur la carte (pas le drag), ouvrir un `Sheet` (side panel droit) avec `LeadDetailContent`
   - Distinguer clic vs drag : ne declencher le sheet que si le pointer n'a pas bouge
3. **Sheet** : utiliser le composant `Sheet` existant (`src/components/ui/sheet.tsx`), largeur elargie (`sm:max-w-2xl`)

### Prochaines etapes du projet
Apres cette fonctionnalite, voici ce qu'il reste a faire pour completer la plateforme :

1. **Authentification** -- Ajouter login/signup pour securiser l'acces et activer les politiques RLS sur les tables
2. **Import automatique Facebook Lead Ads** -- Webhook ou integration pour recevoir les leads automatiquement
3. **Integration Google Calendar** -- Creer des RDV depuis la fiche lead, lien dans les messages generes
4. **Notifications/rappels** -- Alertes email ou push pour les actions en attente
5. **Valeur des deals** -- Ajouter un champ montant aux leads pour calculer le pipeline en euros
6. **Filtres pipeline** -- Filtrer par score, source, ou recherche dans la vue Kanban

