# Mobile : simplifier l'expérience (lecture d'abord)

Objectif : sur petit écran, on voit **immédiatement l'essentiel** d'un lead sans rien toucher, et on ne modifie que si on le demande. Moins de champs à l'écran, gros boutons, texte lisible.

## 1. Fiche lead : lecture avant modification

Aujourd'hui la fiche affiche directement le formulaire « Modifier le lead » (14 champs, dont Campagne Meta) au-dessus des notes et du message initial. Sur mobile c'est une muraille de champs.

Nouveau comportement mobile :

```text
┌──────────────────────────────┐
│ Nom · score · statut         │
│ [Appeler] [WhatsApp]         │  ← gros boutons pleine largeur
├──────────────────────────────┤
│ INFOS DU LEAD (lecture)      │
│ Entreprise · Téléphone       │
│ Email · Offre · Source       │
│ Reçu le …                    │
├──────────────────────────────┤
│ CE QU'IL A ÉCRIT (formulaire)│
│ « … message initial … »      │
├──────────────────────────────┤
│ NOTES                        │
│ notes manuelles + bloc IA    │
├──────────────────────────────┤
│ [ ✏️ Modifier ce lead ]       │  ← ouvre le formulaire
└──────────────────────────────┘
```

- Le formulaire d'édition devient **replié** par défaut sur mobile (déplié comme aujourd'hui sur desktop).
- Le champ Notes en double (une fois dans le formulaire, une fois dans la carte Notes) est supprimé du formulaire : une seule zone de notes.
- Champs techniques (Campagne Meta, Date de création, Présence au RDV) regroupés dans une section « Avancé » repliée sur mobile.

## 2. Onglets plus lisibles

Les 3 onglets (Détails / WhatsApp / Activité) cachent leur libellé sur mobile et n'affichent qu'une icône. On affiche icône **+ texte court** ("Fiche", "WhatsApp", "Suivi") pour que ce soit compréhensible sans deviner.

## 3. Actions : moins, mais évidentes

- « Appeler » et « WhatsApp » en boutons pleine largeur, hauteur confortable, en haut de la fiche.
- « Fusionner » et « Supprimer » descendus en bas de l'onglet Fiche (actions rares, pas à portée de pouce accidentelle).
- Taille de texte minimale 16px sur tous les champs pour éviter le zoom automatique iOS (déjà partiellement fait, à uniformiser).

## 4. Densité générale mobile

- Réduire les cartes IA (Analyse IA, Qualification) à un résumé avec « Voir plus » plutôt que tout déplié.
- Vérifier qu'aucun bloc ne dépasse à droite (notes / message initial longs).

## Détails techniques

- `src/components/LeadDetailContent.tsx` : nouvelle carte résumé lecture seule, réorganisation de l'ordre (résumé → message initial → notes → édition), édition derrière un `Collapsible` quand `useIsMobile()`, libellés d'onglets visibles, actions destructives déplacées en bas.
- `src/components/LeadEditForm.tsx` : suppression du champ Notes (doublon), section « Avancé » repliable regroupant Campagne Meta / Date de création / Présence au RDV, harmonisation `h-11 text-base` sur mobile.
- Aucun changement de logique métier ni de base de données : uniquement présentation.
