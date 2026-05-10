---
name: Sequences per offer
description: followup_sequence_steps a un offer_id nullable. Trigger SQL choisit la séquence dédiée à l'offre du lead, fallback sur séquence par défaut (offer_id IS NULL). UI = sélecteur d'offre + accordéon réglages avancés.
type: feature
---
- Colonne `offer_id` (nullable) sur `followup_sequence_steps` → NULL = séquence par défaut.
- Trigger `create_followup_sequence_for_lead` : si `lead.offer_id` a une séquence dédiée → l'utilise, sinon retombe sur les steps avec `offer_id IS NULL`.
- Edge `test-followup-sequence` : même logique de fallback.
- UI `/settings/automation` refondue : header compact + `OfferSequenceSwitcher` (sticky, dropdown offres avec compteur d'étapes, bouton "Dupliquer depuis Par défaut" / "Supprimer séquence dédiée") + `SequenceEditor offerId={offerId}` + Accordéon "Réglages avancés" (Brief IA, Conditions, 24h, Templates, Mode test).
- Hooks `src/hooks/useSequenceSteps.ts` : `useSequenceSteps(offerId)`, `useDuplicateSequence`, `useDeleteOfferSequence`, `useOfferSequenceCounts`.
- Composant `src/components/automation/OfferSequenceSwitcher.tsx`.
