# Corriger le temps de réponse moyen

## Objectif
Inclure dans la moyenne les leads encore au statut « Nouveau », en comptant leur attente depuis leur création jusqu’à maintenant.

## Mise en œuvre
- Conserver, pour les leads déjà contactés, le délai entre création et premier contact.
- Pour chaque lead encore « Nouveau » sans premier contact, utiliser le délai entre création et l’heure actuelle.
- Calculer la moyenne sur ces deux groupes, dans la période sélectionnée du tableau de bord.
- Adapter le message affiché lorsqu’il n’existe réellement aucun lead à mesurer.
- Vérifier la compilation et le résultat avec un lead « Nouveau » en attente.
