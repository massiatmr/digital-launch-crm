

## Plan: Commande vocale IA avec validation

### Concept
Ajouter un bouton micro au composant `NaturalLanguageInput`. L'utilisateur enregistre un message vocal, le navigateur le transcrit (Web Speech API), puis l'IA propose les actions CRM a executer. L'utilisateur voit un recap et valide ou corrige avant execution.

### Flow utilisateur
1. Clic sur le bouton micro → enregistrement vocal
2. Web Speech API transcrit en texte (affiche dans l'input)
3. Clic envoyer → l'IA analyse et retourne les actions proposees
4. Un dialog de confirmation s'affiche : "Voici ce que l'IA propose" avec la liste des changements
5. L'utilisateur valide → execution, ou corrige le texte et relance

### Implementation technique

**1. Composant `NaturalLanguageInput` - Ajout du micro**
- Ajouter un bouton `Mic` / `MicOff` (lucide-react) a cote de l'input
- Utiliser `webkitSpeechRecognition` / `SpeechRecognition` (API navigateur native, zero dependance)
- Langue: `fr-FR`
- Au resultat, remplir le champ texte automatiquement

**2. Hook `useNaturalLanguageUpdate` - Separer analyse et execution**
- Creer une nouvelle mutation `useAnalyzeNote` qui appelle l'edge function mais retourne seulement les actions proposees sans les executer
- Garder `useApplyUpdate` pour executer apres validation

**3. Dialog de confirmation**
- Utiliser le composant `Dialog` existant
- Afficher : texte transcrit, liste des changements proposes (statut, score, prochaine action, note)
- Boutons : "Valider" (execute), "Corriger" (revient a l'input), "Annuler"

**4. Edge function** - Pas de changement necessaire, la meme endpoint `natural_language_update` retourne deja les donnees structurees

### Fichiers modifies
- `src/components/NaturalLanguageInput.tsx` - Micro + dialog confirmation
- `src/hooks/useLeadData.ts` - Separer analyse/execution

### Note
La Web Speech API fonctionne sur Chrome/Edge/Safari. Un fallback texte reste disponible pour Firefox.

