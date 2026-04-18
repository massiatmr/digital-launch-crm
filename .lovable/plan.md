
## Refonte du panneau latéral de détail du lead

Le composant `LeadDetailContent.tsx` est actuellement une longue liste verticale qui empile tout : header, badges, formulaire d'édition, input IA, message, analyse IA (4 sections), timeline followup, timeline activités, messages générés, scripts. C'est noyé.

### Nouvelle structure proposée

**Header sticky compact** (haut du Sheet, toujours visible)
- Nom + score + statut sur une ligne
- Téléphone cliquable (WA) + email + date création en sous-ligne discrète
- Actions rapides à droite : icônes Éditer / Présence / Supprimer (au lieu de boutons texte)

**Bandeau IA résumé** (juste sous le header, condensé)
- 2-3 lignes max : résumé IA + angle de vente
- Bouton "Voir plus" pour déplier les notes complètes et next_action

**Système d'onglets** (cœur du panneau, remplace l'empilement)
1. **Vue d'ensemble** (par défaut)
   - Message initial du lead (si présent)
   - Bandeau IA déplié (sales_angle, next_action, notes)
   - Input langage naturel pour ajouter une note
2. **Suivi auto** 
   - `FollowupTimeline` (séquence WhatsApp + état conversation)
3. **Activités**
   - `LeadActivityTimeline` (historique manuel : appels, emails, notes)
4. **Contenu IA**
   - Messages générés (WhatsApp/email/SMS) avec copier
   - Scripts de vente avec objections

**Mode édition** : ouvert dans un sous-Sheet (au lieu d'inline qui pousse tout) ou via toggle qui remplace temporairement le contenu du tab actif.

### Bénéfices
- Plus de scroll infini : chaque tab tient dans la viewport
- Header toujours visible → contexte permanent
- L'IA / activités / suivi auto ont leur espace dédié
- Mobile-friendly : tabs plus lisibles que sections empilées

### Fichier impacté
- `src/components/LeadDetailContent.tsx` : refonte complète (réutilise tous les sous-composants existants, change uniquement la structure)

Aucun changement DB, aucune nouvelle dépendance, aucun autre composant à modifier.

<lov-actions>
<lov-suggestion message="Vérifie la nouvelle interface : ouvre une fiche lead depuis la pipeline, navigue les 4 onglets, teste le mode édition, et vérifie que tout reste fluide sur mobile">Vérifier le rendu end-to-end</lov-suggestion>
<lov-suggestion message="Go, refais le panneau latéral du lead avec la structure proposée (header sticky, bandeau IA résumé, 4 onglets)">Lancer la refonte</lov-suggestion>
<lov-suggestion message="Avant la refonte, ajoute aussi un mini compteur d'étape de séquence (ex: 'Étape 2/4 - Relance 1 dans 2h') dans le header sticky">Ajouter compteur séquence au header</lov-suggestion>
</lov-actions>
