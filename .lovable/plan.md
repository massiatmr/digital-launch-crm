

## Historique des interactions / activités par lead

### Le problème
Actuellement, il n'y a aucun moyen de savoir quand tu as relancé un lead pour la dernière fois, ce que tu as fait, et quelle a été sa réponse. Les notes s'accumulent dans un seul champ texte sans date ni structure.

### La solution
Créer un **journal d'activités** (timeline) pour chaque lead, avec :
- La date de chaque interaction
- Le type d'action (appel, WhatsApp, email, relance, note)
- Ce que tu as fait / dit
- La réponse du lead (s'il y en a une)
- La date de première interaction reste toujours visible (`created_at`)

### Implémentation

**1. Nouvelle table `lead_activities`**

```text
lead_activities
├── id (uuid, PK)
├── lead_id (uuid, FK → leads)
├── owner_id (uuid, default auth.uid())
├── activity_type (enum: 'call', 'whatsapp', 'email', 'note', 'relance', 'meeting')
├── description (text) — ce que tu as fait
├── lead_response (text, nullable) — la réponse du lead
├── created_at (timestamptz)
```

RLS : même pattern owner-based que les autres tables.

Ajout d'un champ `last_contacted_at` sur la table `leads` pour un accès rapide à la date de dernière relance (mis à jour automatiquement via trigger ou à l'insertion d'une activité).

**2. Nouveau composant `LeadActivityTimeline.tsx`**

- Timeline verticale dans la fiche lead (entre les notes et les messages)
- Chaque entrée montre : icône du type, date relative ("il y a 3 jours"), description, et réponse du lead si renseignée
- Bouton "Ajouter une interaction" qui ouvre un petit formulaire : type (dropdown), description (textarea), réponse du lead (textarea optionnel)

**3. Formulaire d'ajout d'activité `AddActivityForm.tsx`**

- Dropdown pour le type d'activité (Appel, WhatsApp, Email, Relance, RDV, Note)
- Champ "Ce que j'ai fait" (obligatoire)
- Champ "Réponse du lead" (optionnel)
- À la soumission : insert dans `lead_activities` + update `last_contacted_at` sur le lead

**4. Hook `useLeadActivities`**

- `useLeadActivities(leadId)` — fetch les activités triées par date desc
- `useAddActivity()` — mutation insert + invalidation

**5. Affichage de `last_contacted_at` sur les cards pipeline et la liste leads**

- Badge "Dernière relance : il y a X jours" visible rapidement sans ouvrir le détail
- Alerte visuelle si pas de contact depuis > 7 jours sur un lead chaud

### Fichiers impactés

| Fichier | Changement |
|---|---|
| Migration SQL | Table `lead_activities`, enum `activity_type`, champ `last_contacted_at` sur leads, RLS |
| `src/hooks/useLeadData.ts` | Nouveaux hooks `useLeadActivities`, `useAddActivity` |
| **NEW** `src/components/LeadActivityTimeline.tsx` | Timeline + formulaire d'ajout |
| `src/components/LeadDetailContent.tsx` | Intégrer la timeline |
| `src/pages/PipelinePage.tsx` | Afficher "dernière relance" sur les cards |
| `src/pages/LeadsPage.tsx` | Afficher "dernière relance" dans la liste |

### Ordre d'exécution
1. Migration DB (table + enum + champ leads + RLS)
2. Hooks data
3. Composant timeline + formulaire
4. Intégration dans le détail lead
5. Affichage "dernière relance" sur pipeline et liste

