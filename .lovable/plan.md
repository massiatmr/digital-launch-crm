## Objectif
Permettre, lors d'une fusion de leads, de choisir lead par lead **quelles infos garder** (nom, email, téléphone, société, notes, message, source, offre…) tout en gardant **toutes les conversations et l'historique** sur le lead conservé.

## Cas d'usage concret
Tu as :
- Lead A (WhatsApp) : conversations WhatsApp riches, mais nom/email incomplets.
- Lead B (Lead Form) : email pro, téléphone correct, société, mais pas de conv WhatsApp.

Tu veux garder **A comme lead final** (pour ses conversations) mais récupérer **email + téléphone + société de B**.

## Nouveau flux de fusion

### Étape 1 — Choisir le lead à conserver
Comme aujourd'hui : recherche du doublon, sélection du "lead conservé" (target) vs "lead archivé" (source). Tout l'historique conversationnel (WhatsApp, Messenger, IG, appels, tâches, bookings, activités, qualifications, rappels) part automatiquement sur le lead conservé.

### Étape 2 — Choisir champ par champ quoi garder (nouveau)
Affichage côte à côte des deux fiches avec, pour chaque champ modifiable, **un radio** :

```
                  ◉ Lead conservé (A)      ○ Lead archivé (B)
Nom               Seydou Ali                DLR Transport
Email             (vide)                    contact@dlr.fr
Téléphone         +33 6 12 34 56 78         +33 7 98 76 54 32
Société           (vide)                    DLR TRANSPORT
Message initial   "Salut"                   "Bonjour, je cherche..."
Notes             (vide)                    "Vu sur FB Ads"
Source            whatsapp                  facebook
Offre liée        (aucune)                  Déménageur
Score             warm                      hot
```

Boutons rapides : **"Tout prendre du conservé"**, **"Tout prendre de l'archivé"**, **"Prendre le plus complet"** (auto-sélectionne la valeur non-vide).

### Étape 3 — Confirmation
Récap clair : "Le lead conservé sera mis à jour avec : email = X, téléphone = Y, société = Z. Toutes les conversations des 2 leads seront regroupées sur ce lead. Le lead archivé sera supprimé."

## Modifs techniques

1. **Fonction SQL `merge_leads`** : ajouter un paramètre `field_overrides jsonb` (ex: `{"email":"contact@dlr.fr","phone":"+33...","company_name":"DLR"}`). Après le déplacement des relations, faire un `UPDATE leads SET ... WHERE id = target_id` en appliquant uniquement les champs présents dans `field_overrides`. Les champs absents gardent la valeur actuelle du target.

2. **`MergeLeadDialog.tsx`** : ajouter un 2e écran après le choix du lead à conserver, avec le tableau de radios champ par champ. État local `overrides`, transmis à l'appel RPC.

3. **Champs concernés** : `name`, `email`, `phone`, `company_name`, `message`, `notes`, `source`, `offer_id`, `score`, `status`, `meta_*` (campaign/ad/form/page/adset).
   Champs **non-modifiables** par l'utilisateur (forcés) : `id`, `owner_id`, `workspace_id`, `created_at`, conversations, tâches, etc.

4. **Backward compat** : si `field_overrides` est `null` ou `{}`, comportement actuel (target garde ses valeurs, complétées uniquement si vides — la règle "ne pas écraser" reste le défaut).

## Résultat
Tu choisis quel lead garde l'historique, et tu rapatries les bonnes infos de l'autre. Une seule fiche propre, toutes les conversations regroupées.
