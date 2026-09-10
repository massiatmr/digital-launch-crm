# Réorganiser l'onglet Intégrations

Aujourd'hui tout est empilé sur une seule page très longue : Meta/Facebook, WhatsApp, référence webhook, Conversions API, expéditeur email (SMTP), clés API landing. On scrolle beaucoup et on ne sait plus où on est.

## L'idée : un accueil avec une tuile par intégration

L'onglet Intégrations devient une **page d'accueil** listant chaque intégration sous forme de tuile :

```text
Intégrations · Espace : HKSN Services

+------------------------+  +------------------------+
| f  Facebook / Meta     |  | ✆  WhatsApp Business   |
| 3 pages connectées  ●  |  | 1 numéro actif      ●  |
|              Configurer|  |              Configurer|
+------------------------+  +------------------------+

+------------------------+  +------------------------+
| ◎  Conversions API     |  | ✉  Expéditeur email    |
| Non configuré       ○  |  | Adresse propre      ●  |
|              Configurer|  |              Configurer|
+------------------------+  +------------------------+

+------------------------+  +------------------------+
| ⚿  Clés API site web   |  | ⚙  Avancé (webhooks)   |
| 2 clés actives      ●  |  |                        |
|              Configurer|  |              Configurer|
+------------------------+  +------------------------+
```

Chaque tuile montre : icône, nom, une ligne d'état (connecté / non configuré / action requise) avec pastille de couleur, et un bouton pour ouvrir.

## Ce qui se passe quand on ouvre une intégration

On arrive sur **une page dédiée à cette seule intégration** : titre, retour vers la liste, et uniquement les réglages concernés. Plus rien d'autre à l'écran.

L'adresse de la page change (par exemple `.../integrations/whatsapp`), donc on peut revenir directement dessus, rafraîchir, ou partager le lien. Sur mobile, une intégration = un écran, ce qui règle l'effet « tout empilé ».

## Détail des six écrans

1. **Facebook / Meta** — bouton de connexion Meta, liste des pages, association formulaires → offres, formulaires ignorés, comptes publicitaires.
2. **WhatsApp Business** — numéros, statut, templates, assistant de configuration et aide.
3. **Conversions API** — configuration du suivi Meta et rattrapage des événements.
4. **Expéditeur email** — réglages SMTP de l'espace + test d'envoi.
5. **Clés API site web** — clés pour la landing externe et documentation des champs.
6. **Avancé** — référence webhook Facebook, URL de rappel, jeton de vérification.

Le bandeau récapitulatif d'état actuel reste, mais en haut de la page d'accueil uniquement.

## Notes techniques

- `src/pages/SettingsIntegrationsPage.tsx` (1129 lignes) est découpé : la logique Meta/pages/formulaires/comptes pub et la logique WhatsApp partent dans des composants séparés sous `src/components/settings/integrations/`, avec leurs hooks de chargement respectifs.
- Nouvelle route imbriquée `/settings/integrations/:integration` gérée dans `SettingsPage.tsx` (paramètre optionnel supplémentaire) ou via un état local synchronisé à l'URL avec `useSearchParams` si l'ajout de route est plus intrusif ; l'option route est préférée.
- Sans paramètre → grille de tuiles ; avec paramètre → écran dédié + bouton retour.
- Les dialogues existants (`MetaOAuthPicker`, `WhatsAppHelpDialog`, `WhatsAppSystemUserWizard`) restent montés dans l'écran correspondant ; le retour OAuth (`?meta_session=…`) redirige vers l'écran Facebook.
- `IntegrationStatusOverview` alimente les états des tuiles pour éviter un double calcul.
- Aucun changement de comportement backend : mêmes appels, mêmes fonctions, seule l'organisation de l'écran change.
