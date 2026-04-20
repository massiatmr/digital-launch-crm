

# Assistant IA — Multi-fichiers, multi-leads, mapping intelligent

Aujourd'hui l'assistant IA accepte uniquement texte + voix, et crée/modifie **un seul lead à la fois**. Objectif : en faire un véritable agent capable d'ingérer des **documents (CSV, Excel, PDF, images, texte collé)** contenant **plusieurs leads ou clients**, de **mapper intelligemment** chaque colonne vers les bons champs CRM, de **dédupliquer**, et de te présenter un **aperçu vérifiable** avant insertion.

## Ce que tu vas pouvoir faire

1. **Drag & drop ou bouton "Joindre fichier"** dans l'assistant IA flottant (Sparkles)
2. Formats acceptés : `.csv`, `.xlsx`, `.xls`, `.pdf`, `.txt`, images (`.png/.jpg` — OCR), copier-coller texte brut
3. L'IA lit le fichier, **détecte automatiquement** :
   - Type d'enregistrement (lead, client, RDV)
   - Colonnes mal nommées ("Tel portable" → `phone`, "Société" → `company_name`, etc.)
   - Lignes invalides (emails malformés, doublons par email/téléphone)
   - Source probable (Facebook Ads, Google Sheets, formulaire web…)
4. Affiche un **tableau de prévisualisation éditable** : tu vois chaque ligne mappée, tu peux corriger une cellule, désélectionner des lignes, fusionner les doublons détectés
5. **Détection des doublons** par email + téléphone normalisé contre les leads existants → tu choisis "ignorer / mettre à jour / créer quand même"
6. **Bouton "Importer N leads"** insère le tout en une transaction, avec scoring IA optionnel

## Architecture technique

### Frontend
- **`GlobalNaturalLanguageInput`** : ajout d'une zone drag-drop + bouton 📎. Détection du type de fichier côté client.
- **Parsing client** :
  - CSV → `papaparse` (déjà léger, à ajouter)
  - Excel → `xlsx` (SheetJS)
  - PDF/image → envoi direct à l'edge function (Gemini multimodal gère)
  - Texte → envoi direct
- **Nouveau composant `BulkImportPreview`** (Sheet plein écran) : tableau éditable avec colonnes mappées, badges doublon/erreur/OK, checkboxes de sélection, actions par ligne.

### Backend (nouvelle edge function `ai-bulk-import`)
- Accepte : `{ rows: any[], rawText?: string, fileBase64?: string, fileName?: string, mimeType?: string }`
- Étapes :
  1. **Normalisation** : si CSV/XLSX → reçoit déjà des lignes structurées. Si PDF/image/texte → demande à Gemini d'extraire un tableau JSON.
  2. **Mapping IA** (Gemini 2.5 Flash + tool calling) : pour chaque ligne, retourne un objet conforme au schéma `leads` (name, email, phone, company_name, message, source, score, notes, status). Les champs inconnus vont dans `notes`.
  3. **Validation** : email regex, normalisation téléphone via `lib/phone.ts`, source mappée sur l'enum existant.
  4. **Détection doublons** : query `leads` sur email+phone normalisés du workspace, retourne `duplicate_of: lead_id` par ligne.
  5. Réponse : `{ rows: MappedRow[], stats: { total, valid, duplicates, errors } }` — **aucune insertion** à cette étape.
- Insertion finale faite côté client via `supabase.from('leads').insert(...)` après validation utilisateur (respecte RLS owner_id/workspace_id).

### Sécurité & limites
- Validation JWT (pattern existant `getClaims`)
- Limite : **500 lignes max par import**, fichiers ≤ 5 MB
- Gestion 429/402 du gateway AI avec toasts (pattern existant)
- Aucune insertion sans confirmation explicite dans la preview

### Ce qu'on garde / supprime
- **`ImportPage.tsx`** existant : conservé mais devient un raccourci qui ouvre directement l'assistant IA en mode bulk (le parsing CSV manuel actuel est trop limité)
- Mode "single lead" actuel de l'assistant : préservé, le bulk s'active automatiquement quand un fichier ≥ 2 lignes est détecté

## Fichiers touchés

| Fichier | Action |
|---|---|
| `src/components/GlobalNaturalLanguageInput.tsx` | Ajout drag-drop + bouton 📎 + détection bulk |
| `src/components/BulkImportPreview.tsx` | **Nouveau** — tableau éditable de prévisualisation |
| `supabase/functions/ai-bulk-import/index.ts` | **Nouveau** — mapping IA + dédup |
| `package.json` | + `papaparse`, `xlsx` |
| `src/pages/ImportPage.tsx` | Simplifié → bouton "Ouvrir l'assistant IA" |

## Étapes de livraison

1. Edge function `ai-bulk-import` (mapping + dédup, sans insertion)
2. Composant `BulkImportPreview` avec édition inline
3. Intégration drag-drop + parsing CSV/XLSX/PDF dans `GlobalNaturalLanguageInput`
4. Test end-to-end avec un vrai fichier CSV de leads

