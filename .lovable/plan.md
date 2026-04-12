

## Plan: Corriger le taux de closing + show_status partout

### Logique du taux de closing

La formule actuelle filtre `show_status === 'show'` sur les propositions et les perdus, ce qui est trop restrictif.

Nouvelle formule demandee :
- **Numerateur** : leads avec `status = 'won'`
- **Denominateur** : `won` + `proposal` (tous, en cours) + `lost` avec `show_status = 'show'` (presents au RDV mais perdus)

Cela mesure : parmi tous ceux a qui une proposition a ete faite (en cours ou gagnes) et ceux qui ont ete vus en RDV mais perdus, combien ont signe.

### Modifier le show_status partout

Actuellement le champ "Presence au RDV" est modifiable uniquement dans le formulaire d'edition (LeadEditForm). L'utilisateur veut pouvoir le changer depuis :

1. **Pipeline (PipelinePage.tsx)** : ajouter un mini-selecteur show_status directement sur chaque carte
2. **Liste des leads (LeadsPage.tsx)** : ajouter un indicateur cliquable show/noshow/pending sur chaque ligne
3. **Page bookings (BookingsPage.tsx)** : ajouter un selecteur de presence sur chaque booking (en mappant vers le lead associe)
4. **Fiche lead (LeadDetailContent.tsx)** : ajouter un selecteur rapide dans le header, sans ouvrir le formulaire d'edition

### Fichiers modifies

| Fichier | Changement |
|---|---|
| `src/pages/Dashboard.tsx` (lignes 73-78) | Nouvelle formule closing rate |
| `src/pages/PipelinePage.tsx` | Mini-select show_status sur PipelineCard |
| `src/pages/LeadsPage.tsx` | Badge cliquable show_status sur chaque ligne |
| `src/pages/BookingsPage.tsx` | Select show_status lie au lead_id du booking |
| `src/components/LeadDetailContent.tsx` | Select rapide show_status dans le header |

### Detail technique

```typescript
// Dashboard.tsx - nouvelle formule
const wonLeads = leads.filter(l => l.status === 'won');
const inProposal = leads.filter(l => l.status === 'proposal');
const lostButShowedUp = leads.filter(l => l.status === 'lost' && l.show_status === 'show');
const closingDenominator = wonLeads.length + inProposal.length + lostButShowedUp.length;
const closingRate = closingDenominator > 0
  ? Math.round((wonLeads.length / closingDenominator) * 100) : 0;
```

Pour les selecteurs rapides, un petit composant `ShowStatusToggle` sera cree et reutilise partout. Il appellera `useUpdateLead` pour mettre a jour le `show_status` en un clic.

