

## Plan : Corriger le taux de qualification

### Probleme actuel

La formule actuelle (ligne 128-130) compare les leads dont le **statut actuel** est `qualified/proposal/won` vs ceux qui sont `qualified/proposal/won/lost`. Cela exclut un lead qui a été qualifié puis a avancé vers `proposal` ou `won` — il n'est compté que dans sa catégorie finale.

En réalité, le taux de qualification devrait mesurer : **combien de leads sont passés au moins une fois au stade "qualifié" ou au-delà**, peu importe leur statut actuel.

### Logique corrigée

Un lead est "qualifié" s'il a atteint `qualified`, `proposal`, ou `won` **à un moment donné**. Puisqu'on n'a pas d'historique de transitions en base, on utilise le fait que si un lead est actuellement en `proposal`, `won`, ou `lost` (après avoir été qualifié), il est forcément passé par la qualification.

**Numérateur** : leads avec statut actuel parmi `qualified`, `proposal`, `won`, `lost` (tous ceux qui ont dépassé le stade "contacté")

**Dénominateur** : tous les leads de la période (ou au minimum ceux qui ne sont plus "new")

Mais plus simplement, la demande de l'utilisateur est claire : **tous ceux qui sont passés de contacté à qualifié comptent, même s'ils ont ensuite été perdus ou gagnés**.

Donc :
- **Numérateur** = leads avec statut `qualified` OR `proposal` OR `won` OR `lost` (car pour être lost il faut avoir été au moins qualifié dans ce flow)
- **Dénominateur** = tous les leads qui ont été au moins contactés = statut != `new`

### Fichier modifié

| Fichier | Changement |
|---|---|
| `src/pages/Dashboard.tsx` (lignes 127-130) | Nouvelle formule : qualifiés (et au-delà) / contactés (et au-delà) |

### Code

```typescript
// — KPI 6: Qualification rate (passés de contacté à qualifié+)
const qualifiedAndBeyond = leads.filter(l => ['qualified', 'proposal', 'won', 'lost'].includes(l.status));
const contactedAndBeyond = leads.filter(l => l.status !== 'new');
const qualificationRate = contactedAndBeyond.length > 0 
  ? Math.round((qualifiedAndBeyond.length / contactedAndBeyond.length) * 100) : 0;
```

Sous-titre du KPI : `${qualifiedAndBeyond.length} qualifiés / ${contactedAndBeyond.length} contactés`

