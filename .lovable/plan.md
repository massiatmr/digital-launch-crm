# Créer un rendez-vous depuis une fiche lead

## Résultat attendu
- Ajouter un bouton **Créer un rendez-vous** dans la fiche du lead, visible aussi sur mobile.
- Ouvrir un formulaire simple prérempli avec le nom, l’email et le téléphone du lead.
- Permettre de choisir l’offre, la date, un créneau réellement disponible, la durée configurée et des notes.
- Après confirmation, rattacher le rendez-vous au lead existant sans créer de doublon.
- Afficher immédiatement le nouveau rendez-vous dans ses activités et permettre d’ouvrir sa fiche détaillée.

## Comportement
- Utiliser les disponibilités et les conflits calendrier déjà configurés pour l’espace de travail.
- Passer par le parcours de réservation existant afin de conserver la synchronisation agenda, les emails et rappels programmés.
- Afficher une erreur claire si le lead n’a pas les coordonnées requises ou si aucun créneau n’est disponible.
- Empêcher les doubles validations pendant la création.

## Détails techniques
- Créer un dialogue dédié réutilisable depuis la fiche lead.
- Étendre le traitement de réservation pour accepter explicitement l’identifiant du lead existant, après contrôle qu’il appartient au même espace de travail que l’offre.
- Invalider les listes de rendez-vous et activités après succès.
- Vérifier la compilation et le parcours complet sur ordinateur et mobile.
