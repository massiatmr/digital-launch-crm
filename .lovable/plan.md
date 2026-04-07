

# Plan : Signature électronique intégrée (Option A)

## Résumé

Le client génère un contrat depuis la fiche client, clique "Envoyer pour signature", le client reçoit un email avec un lien vers une page publique élégante où il peut lire le contrat et signer via un pad tactile. Le PDF signé est stocké et le statut est mis à jour dans le CRM.

## Flux utilisateur

```text
CRM: Contrat prêt → "Envoyer pour signature"
        ↓
Email au client avec lien /sign/:token
        ↓
Page publique: lecture du contrat → signature au doigt/souris
        ↓
Validation: signature + IP + timestamp enregistrés
        ↓
PDF signé généré et stocké dans Supabase Storage
        ↓
CRM: statut "Signé" visible + PDF téléchargeable
```

## Étapes d'implémentation

### 1. Migration base de données

Table `contract_signatures` :
- `id` (uuid, PK)
- `client_id` (uuid, ref clients)
- `owner_id` (uuid, auth.uid)
- `token` (text, unique, généré côté serveur)
- `contract_data` (jsonb — snapshot complet du contrat au moment de l'envoi)
- `signature_image` (text — base64 du PNG de la signature)
- `signed_at` (timestamptz)
- `signer_ip` (text)
- `signer_user_agent` (text)
- `status` (text: `pending`, `signed`, `expired`)
- `signed_pdf_path` (text — chemin dans le storage)
- `created_at`, `expires_at`

RLS : owner peut CRUD, anon peut SELECT/UPDATE par token (pour la page publique).

Storage bucket `signed-contracts` (privé) pour stocker les PDFs signés.

### 2. Composant `SignaturePad.tsx`

Canvas HTML5 tactile/souris avec :
- Dessin fluide au doigt ou à la souris (support touch events)
- Bouton "Effacer" pour recommencer
- Export en base64 PNG
- Style sombre cohérent avec le thème de l'app pour la page publique (fond clair pour la page publique)

### 3. Page publique `/sign/:token`

Route publique (pas de ProtectedRoute). UX soignée :
- **Étape 1** : affichage du contrat en lecture seule (articles, montants, parties prenantes) dans un design propre
- **Étape 2** : zone de signature avec le pad tactile
- **Étape 3** : confirmation avec récapitulatif + bouton "Confirmer et signer"
- **Écran de succès** : animation + message "Votre contrat a été signé"
- **États d'erreur** : token invalide, expiré, déjà signé

Design : fond blanc, typographie Plus Jakarta Sans, accents violet (primary), responsive mobile-first.

### 4. Edge Function `validate-signature`

- GET `/validate-signature?token=xxx` : vérifie le token, retourne les données du contrat si valide
- POST `/validate-signature` : reçoit `{ token, signatureBase64 }`, enregistre la signature + IP + user-agent, génère le PDF signé via une régénération du contrat avec signature intégrée, le stocke dans le bucket, met à jour le statut

### 5. Mise à jour de `generateContractPDF.ts`

Ajouter un paramètre optionnel `signatureBase64` + `signedAt` + `signerIP` :
- Si fourni, ajouter en dernière page : bloc signature avec l'image, date/heure, IP, mention légale "Signé électroniquement le..."

### 6. Mise à jour de `ContractGenerator.tsx`

- Nouveau bouton "Envoyer pour signature" (en plus de Télécharger et Envoyer par email)
- Au clic : crée une entrée `contract_signatures` avec le snapshot du contrat + token, puis envoie un email avec le lien
- Affichage du statut de signature sous le bouton (En attente / Signé le...)
- Bouton "Télécharger le contrat signé" quand signé

### 7. Email d'invitation à signer

Utilise l'edge function `send-document-email` existante (sans pièce jointe) ou un simple invoke pour envoyer un email HTML avec un bouton "Signer mon contrat" pointant vers `/sign/:token`.

## Fichiers à créer

| Fichier | Description |
|---------|-------------|
| `supabase/migrations/xxx_contract_signatures.sql` | Table + RLS + bucket |
| `src/components/SignaturePad.tsx` | Composant canvas signature |
| `src/pages/PublicSignaturePage.tsx` | Page publique de signature |
| `supabase/functions/validate-signature/index.ts` | Validation + enregistrement |

## Fichiers à modifier

| Fichier | Changement |
|---------|------------|
| `src/App.tsx` | Ajouter route `/sign/:token` |
| `src/lib/generateContractPDF.ts` | Support signature dans le PDF |
| `src/components/ContractGenerator.tsx` | Bouton envoi pour signature + statut |
| `src/hooks/useClientData.ts` | Hook pour les signatures |

## Détails techniques

- Le token est un hex aléatoire de 64 caractères généré côté DB
- Expiration par défaut : 7 jours
- L'IP du signataire est capturée via les headers de la requête Edge Function
- Le PDF signé est stocké dans un bucket privé, accessible uniquement par le owner
- Le snapshot `contract_data` garantit que le contrat signé est immuable (même si on modifie le contrat après envoi)

