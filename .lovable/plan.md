
## Objectif

Transformer `/conversations` en vrai client WhatsApp : pouvoir **démarrer** une nouvelle discussion (lead, client, ou numéro libre), avec gestion automatique de la fenêtre 24h Meta (template si nécessaire, texte libre sinon).

## UX cible

1. Bouton **« Nouvelle conversation »** (icône crayon ✏️) en haut de la liste de gauche, à côté du compteur.
2. Clic → ouvre un **Sheet/Dialog "Nouveau message"** :
   - Onglet **Contacts** : recherche unifiée (leads + clients ayant un téléphone).
     - Affiche : avatar/initiale, nom, téléphone, badge "Lead" / "Client", indicateur "💬 conversation existante" si déjà un historique WA.
   - Onglet **Numéro libre** : champ téléphone (+ formatage FR auto via `toWhatsAppUrl`/`formatPhoneDisplay`) + champ nom optionnel.
3. Sélection d'un contact :
   - Si conversation existante → redirection vers `/conversations?lead=<id>` (comportement actuel).
   - Sinon → si c'est un **client**, on crée d'abord un lead "miroir" lié (ou on étend le hook inbox pour accepter les `client_id`). Si c'est un **numéro libre**, on crée un lead minimal (`name = saisi ou téléphone`, `phone`, `source = 'whatsapp_direct'`, `status = 'new'`, `owner_id`/`workspace_id` courants).
   - Puis ouverture du chat sur ce lead.
4. **Composer intelligent** dans `WhatsAppChat` :
   - Détecte la **fenêtre 24h** (dernier message inbound < 24 h) côté client à partir des messages déjà chargés.
   - **Hors fenêtre / aucun inbound** : la zone de texte affiche un bandeau « Hors fenêtre 24h — envoie un template approuvé » + un bouton **« Choisir un template »** qui ouvre le sélecteur (`useWhatsAppTemplates`) avec preview et variables. Le bouton "Envoyer" texte libre est désactivé.
   - **Dans la fenêtre** : composer texte libre normal (déjà en place).
   - Fallback : si l'envoi texte libre est rejeté par Meta (code 131047 / hors fenêtre), on affiche un toast et on bascule automatiquement sur le sélecteur de template.

## Changements code

### Frontend
- `src/pages/ConversationsPage.tsx`
  - Ajouter bouton "Nouvelle conv" + état `composeOpen`.
  - Monter `<NewConversationSheet />` qui callback `(leadId) => selectLead(leadId)`.
- `src/components/conversations/NewConversationSheet.tsx` *(nouveau)*
  - Tabs Contacts / Numéro libre.
  - Recherche debounced sur `leads` (id, name, phone) et `clients` (id, name, phone, company_name) du workspace courant.
  - Indicateur "conversation existante" en croisant avec `useWhatsAppInbox().items`.
  - Action `startConversation` :
    - Lead existant → renvoie son id.
    - Client sans lead lié → insert `leads` (name, phone, source='client_export', client_id si la colonne existe, sinon notes), renvoie l'id.
    - Numéro libre → normalise via `toWhatsAppUrl`, insert `leads` (name, phone, source='whatsapp_direct', status='new', owner_id, workspace_id), renvoie l'id.
- `src/components/WhatsAppChat.tsx`
  - Calcul `isWithin24h = lastInboundAt && now - lastInboundAt < 24h`.
  - Si non → bandeau + désactivation envoi texte + bouton "Choisir template" (ouvre `TemplatePickerDialog` existant ou nouveau, en réutilisant `useWhatsAppTemplates` + `preview-template-message` + `send-whatsapp-message` avec `template`).
  - Catch erreur Meta `131047` → ouvre le picker automatiquement.
- `src/components/conversations/TemplatePicker.tsx` *(nouveau, petit)*
  - Liste les templates approuvés du workspace, formulaire pour les variables `{{1}}…`, preview, bouton Envoyer.

### Backend (vérifications, pas de nouvelle table)
- Vérifier que `send-whatsapp-message` accepte déjà `{ type: 'template', template_name, language, components }`. Si non, ajouter cette branche (lecture `whatsapp_config` du workspace, POST `/messages` Meta avec payload template, insert dans `whatsapp_messages` direction outbound).
- Aucune migration : on s'appuie sur `leads.source`, `leads.workspace_id`, `whatsapp_messages` existants.

### Détails techniques
- Réutiliser `useCurrentWorkspaceId` pour scoper la création de lead.
- Utiliser `toWhatsAppUrl`/`formatPhoneDisplay` (`src/lib/phone.ts`) pour normaliser FR.
- Validation Zod du numéro libre (E.164 souple : `^\+?\d{8,15}$`) + nom max 100 chars.
- Indexer recherche : `or('name.ilike.%q%,phone.ilike.%q%')` sur leads et clients, limit 20.
- Tri résultats : conversations existantes d'abord, puis ordre alphabétique.

## Hors scope (pas dans ce PR)
- Notes vocales / pièces jointes au 1er message (déjà géré par WhatsAppChat dans la fenêtre 24h).
- Création/soumission de nouveaux templates Meta (déjà couvert par `whatsapp-templates-manage`).
- Multi-sélection / broadcast.
