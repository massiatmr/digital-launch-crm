# Plan : Génération de Factures et Contrats PDF par Client

## Résumé

Ajouter dans chaque fiche client 2 nouvel onglet **"Facturation"** avec deux sections : génération de **facture** et génération de **contrat**. Chaque document sera généré en PDF côté client avec les données pré-remplies depuis la fiche client, tout en laissant les champs importants éditables. Deux boutons par document : "Télécharger en PDF" et "Envoyer par email".

## Ce qui sera customisable

### Facture

- Numéro de facture (auto-incrémenté, modifiable)
- Date et date d'échéance
- **Destinataire** : nom entreprise, représentant, adresse, SIRET (pré-remplis depuis la fiche client)
- **Lignes de facturation** : description, prix unitaire, quantité (ajout/suppression de lignes)
- **Modalités de paiement** : sélection du type de service avec termes pré-définis :
  - **Site Web** : 50% à la commande, 50% à la livraison
  - **Meta Ads** : premier mois payé d'avance, puis toutes les 4 semaines
  - **Livrables Personnalisé** : texte libre

### Contrat

- **Entreprise cliente** : nom, représentant, adresse, email, téléphone (pré-remplis)
- **Type de prestation** : Site Web ou Meta Ads (change les articles automatiquement)
- **Montants** : frais de configuration, honoraires de gestion
- **Budget publicitaire recommandé** (pour Ads)
- **Date du contrat**

### Info émetteur (hardcodée, non modifiable)

DIGITAL LAUNCH LLC, 75 E 3RD ST, Sheridan, Wyoming 82801, EIN: 98-1872816, IBAN: BE14 9056 0242 6183, SWIFT: TRWIBEB1XXX

## Fichiers à créer/modifier

### 1. `src/components/InvoiceGenerator.tsx` (nouveau)

- Formulaire avec les champs éditables de la facture
- Sélecteur de type de service (Site Web / Ads / Personnalisé) qui pré-remplit les modalités de paiement
- Tableau de lignes de facturation dynamique
- Boutons "Télécharger PDF" et "Envoyer par email"

### 2. `src/components/ContractGenerator.tsx` (nouveau)

- Formulaire avec les champs éditables du contrat
- Sélecteur du type de prestation (Site Web / Meta Ads) qui adapte les articles
- Champs montants et budget
- Boutons "Télécharger PDF" et "Envoyer par email"

### 3. `src/lib/generateInvoicePDF.ts` (nouveau)

- Utilise **jspdf** pour générer le PDF de facture
- Reproduit fidèlement le layout du template fourni (logo, tableau, règlement, mentions légales)

### 4. `src/lib/generateContractPDF.ts` (nouveau)

- Utilise **jspdf** pour générer le PDF de contrat sur 2 pages
- Articles adaptés selon le type de service

### 5. `src/pages/ClientDetailPage.tsx` (modifié)

- Ajout d'un onglet **"Facturation"** dans les Tabs
- Intègre les composants `InvoiceGenerator` et `ContractGenerator`
- Passe les données client comme props pour le pré-remplissage

### 6. `supabase/functions/send-document-email/index.ts` (nouveau)

- Edge function pour envoyer le PDF en pièce jointe par email via l'infrastructure email existante

## Dépendance

- Installation du package **jspdf** pour la génération PDF côté client

## Détails techniques

- Les PDFs sont générés côté client avec jspdf (pas besoin de serveur)
- Le logo `src/assets/logo.webp` sera converti en base64 et intégré dans les PDFs
- Les données client (nom, entreprise, email, téléphone) sont pré-remplies depuis `useClient(id)`
- L'offre associée au client détermine le type de service par défaut
- L'envoi par email utilisera l'infrastructure email déjà en place dans le projet