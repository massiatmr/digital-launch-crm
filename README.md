# Digital Launch CRM

Contexte global :

Je gère un business où je reçois des leads via Facebook Lead Ads, formulaires web et autres sources. Mon objectif est de transformer ces leads en clients tout en automatisant un maximum de tâches répétitives, mais je veux garder le contrôle humain final sur l’envoi des messages WhatsApp. Je veux une plateforme tout-en-un qui me permette de :

centraliser tous mes leads

analyser et scorer chaque lead automatiquement avec une IA

générer des messages personnalisés (WhatsApp, email, SMS) prêts à envoyer

préparer des scripts de sales call adaptés à chaque lead

planifier des rappels et suivre les prochaines actions

mettre à jour automatiquement le CRM à partir de simples notes en langage naturel

intégrer Google Calendar pour planifier mes rendez-vous

garder tout ça gratuit ou très peu coûteux (<100 $ par an)

Fonctionnalités détaillées :

Import automatique des leads :

Recevoir des leads depuis Facebook Lead Ads, formulaires web ou Google Sheets.

Chaque lead est stocké dans la base de données avec : nom, email, téléphone, message, source, date, statut, notes IA.

Analyse et scoring des leads :

L’IA évalue le lead : chaud, tiède, froid.

Génère un résumé clair pour chaque lead.

Propose un “angle de vente” et un script de call.

Génération de messages WhatsApp / SMS / email :

L’IA crée un message prêt à copier, avec :

nom du lead

contexte de son besoin

lien vers mon calendrier

ton adapté (perso, professionnel, engageant)

Le message est affiché dans l’interface pour envoi manuel.

Scripts de sales call :

Pour chaque lead chaud, générer un mini script adapté à son profil et ses besoins.

Suggestions pour objections possibles et réponses rapides.

Rappels et notifications :

L’IA planifie automatiquement les prochaines actions (rappel, email, follow-up).

Notifications mobile ou email pour m’informer qu’une action est prête.

Mise à jour CRM par langage naturel :

Je peux écrire ou dicter des notes simples (ex : “appel fait, intéressé mais doit en parler avec associé”).

L’IA interprète et met à jour : statut, rappel, note, pipeline.

Google Calendar intégré :

Création automatique de rendez-vous à partir des leads ou actions programmées.

Lien dans les messages générés.

Interface utilisateur simple :

Dashboard pour voir pipeline, leads, messages préparés, scripts de call, rappels.

Possibilité de filtrer par lead chaud, tiède ou froid.

Priorité coût :

Tout service utilisé doit être gratuit ou open-source si possible.

WhatsApp → messages préparés seulement, envoi manuel pour éviter le coût de l’API.

IA → utiliser des modèles gratuits ou limiter les appels payants.

Stockage → Supabase, Airtable ou base Lovable gratuite.

Consignes pour l’IA :

Créer la logique du workflow complet : réception lead → analyse → message/script → CRM → rappel → notifications.

Générer toutes les interfaces nécessaires pour que je voie : pipeline, messages préparés, scripts et rappels.

Permettre d’ajouter facilement de nouvelles sources de leads ou d’automatisations.

Prioriser la simplicité, l’efficacité et la personnalisation par IA.

Fournir un système prêt à l’emploi, minimal en coût mais complet en fonctionnalités.

Font Questrial pour titre et 
tu met le logo en tout petit car j'ai pas de bonne dimension plus il est blanc donc fond sombre crée la plateforme en fond sombre.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://digital-launch-crm.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/20a7d519-3bce-45c3-94a6-ac19e2d5ec7a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
