## Objectif
Empêcher qu’un même prospect venant d’un Lead Form puis de WhatsApp crée deux leads, deux conversations et deux automatisations, puis ajouter une façon propre de fusionner les doublons existants.

## Solution proposée

1. **Identifier un prospect avec une vraie clé cross-canal**
   - Ajouter une table dédiée aux identités de contact par workspace : téléphone normalisé, email, identifiant WhatsApp, Messenger/Instagram si utile plus tard.
   - Quand un Lead Form arrive, on enregistre ses identités disponibles.
   - Quand un WhatsApp arrive, on cherche d’abord cette identité avant de créer un lead.
   - Le match téléphone sera basé sur chiffres normalisés, pas sur le format affiché (`075...`, `+33...`, espaces, etc.).

2. **Changer le comportement WhatsApp**
   - Si le numéro WhatsApp correspond à un lead existant du même workspace, le message est rattaché au lead existant.
   - Le lead existant est enrichi avec le numéro WhatsApp si besoin.
   - Aucune nouvelle automation “nouveau lead” n’est créée dans ce cas.
   - La conversation WhatsApp apparaît donc dans le même dossier lead.

3. **Sécuriser l’automatisation anti-double message**
   - Lorsqu’un lead existant reçoit un signal WhatsApp entrant, annuler les relances automatiques encore en attente sur les doublons potentiels.
   - Garder une seule séquence active par lead réel.
   - Éviter qu’un template initial parte deux fois si le Lead Form et WhatsApp arrivent très proches dans le temps.

4. **Ajouter une fusion propre de leads**
   - Créer une fonction backend `merge_leads(source_lead_id, target_lead_id)`.
   - Elle déplacera vers le lead cible :
     - messages WhatsApp/Messenger/Instagram,
     - appels WhatsApp,
     - tâches de relance,
     - état de conversation,
     - qualifications IA,
     - activités,
     - rappels,
     - bookings,
     - scripts/messages générés,
     - labels de conversation.
   - Elle fusionnera les champs utiles sans écraser les données existantes : email, téléphone, société, notes, message, offer/source si manquants.
   - Puis elle marquera le doublon comme supprimé (`deleted_at`) au lieu de le supprimer définitivement.

5. **Ajouter une action dans l’interface**
   - Dans la fiche lead ou la conversation, ajouter “Fusionner avec un autre lead”.
   - Recherche par nom/téléphone/email.
   - Confirmation claire : choisir le lead à garder, puis fusionner.
   - Après fusion, rediriger automatiquement vers le lead conservé.

## Pour ton cas actuel
Je fusionnerais le lead WhatsApp `DLR TRANSPORT` dans le lead Facebook `Seydou Ali`, parce que le Facebook contient déjà le formulaire complet, l’email et le contexte ads. Les messages WhatsApp et les notes IA seraient déplacés dessus, puis le lead WhatsApp serait archivé.

## Fichiers / zones à modifier
- Migrations Lovable Cloud : table d’identités + fonction `merge_leads` + index utiles.
- `supabase/functions/whatsapp-webhook/index.ts` : résolution du lead par identité téléphone avant création.
- `supabase/functions/facebook-webhook/index.ts` et `supabase/functions/ingest-lead/index.ts` : création/mise à jour des identités à chaque signal Lead Form.
- UI lead/conversation : bouton de fusion + dialogue de recherche/confirmation.

## Résultat attendu
Un prospect = un lead = une conversation unifiée = une seule automation, même s’il arrive par Lead Form puis écrit lui-même sur WhatsApp.