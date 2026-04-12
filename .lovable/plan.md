

## Plan : Simplifier le taux de closing

### Logique corrigée

La formule actuelle est trop compliquée. L'utilisateur veut simplement :

- **Numérateur** : leads avec `status = 'won'`
- **Dénominateur** : tous les leads avec `show_status = 'show'` (peu importe leur statut actuel)

Exemple : 11 personnes présentes au RDV, 4 gagnées → 4/11 = 36%

### Fichier modifié

| Fichier | Changement |
|---|---|
| `src/pages/Dashboard.tsx` (lignes 73-78) | Nouvelle formule simplifiée |

### Code

```typescript
// — KPI 5: Closing rate (gagné / total présents au RDV)
const wonLeads = leads.filter(l => l.status === 'won');
const allShowedUp = leads.filter(l => l.show_status === 'show');
const closingRate = allShowedUp.length > 0
  ? Math.round((wonLeads.length / allShowedUp.length) * 100) : 0;
```

Sous-titre du KPI : `${wonLeads.length} gagné / ${allShowedUp.length} présents`

