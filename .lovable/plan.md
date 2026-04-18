
Objectif: rendre les notifications WhatsApp fiables sur Mac + iPhone quand tu es connectée, avec visibilité complète sur ce qui se passe.

Diagnostic A à Z déjà établi
- Le problème n’est pas un blocage total du transport push: les logs récents de `send-push` montrent au moins un envoi ciblé réussi.
- Le vrai point faible est la fiabilité du cycle d’abonnement + l’absence d’observabilité:
  - `usePushNotifications.ts` n’enregistre qu’un endpoint + user agent. Il manque un identifiant stable d’appareil, un heartbeat, et un état de santé.
  - `SettingsTestsPage.tsx` lit la DB et déduplique par endpoint seulement. Si l’abonnement change/rotate, les appareils semblent apparaître/disparaître.
  - `send-push/index.ts` envoie bien, mais ne garde pas d’historique persistant par appareil.
  - `whatsapp-webhook/index.ts` déclenche le push en “fire-and-forget”, donc très peu de visibilité si l’envoi échoue.
- Le Service Worker est simple mais correct. Le souci est surtout côté backend/lifecycle, pas l’affichage local.
- Bonne nouvelle: quand l’app est ouverte, le temps réel WhatsApp existe déjà (`useWhatsAppInbox`, `useWhatsAppRealtime`). Il faut donc fiabiliser le push pour le mode arrière-plan/app fermée.

Plan solide de mise en place

1. Stabiliser l’identité de chaque appareil
- Étendre `push_subscriptions` avec des champs de santé et de suivi:
  - `device_id`
  - `device_label`
  - `platform`
  - `browser`
  - `is_standalone`
  - `last_seen_at`
  - `last_success_at`
  - `last_failure_at`
  - `last_error`
  - `status` (`active`, `invalid`, `blocked`)
- Garder l’unicité par endpoint, mais utiliser `device_id` pour reconnaître un même appareil même si son endpoint change.
- Ajouter RLS pour lecture propriétaire comme le reste du CRM.

2. Corriger le cycle d’abonnement côté client
- Modifier `usePushNotifications.ts` pour:
  - générer/persister un `device_id` local stable
  - faire un “sync subscription” au chargement de l’app, au login, et après permission accordée
  - mettre à jour `last_seen_at` même sans recliquer sur “Activer”
  - marquer clairement si l’iPhone est en mode PWA standalone ou non
- Résultat attendu: ton Mac et ton iPhone restent visibles de façon stable dans la liste.

3. Refaire le backend push pour qu’il soit traçable
- Renforcer `send-push/index.ts`:
  - validation d’auth côté code pour les appels utilisateur
  - support propre de 3 modes:
    - tous les appareils actifs
    - appareil courant
    - appareils sélectionnés
  - journaliser chaque tentative par appareil
  - ne supprimer que les abonnements réellement expirés (404/410)
  - marquer les erreurs transitoires sans effacer l’appareil
- Retourner un résultat structuré par appareil, pas juste `sent/failed`.

4. Ajouter un historique persistant des envois
- Créer une table dédiée type `push_delivery_logs` avec:
  - `user_id`
  - `subscription_id`
  - `source` (`manual_test`, `whatsapp_inbound`, `reminder`, etc.)
  - `title`
  - `body_preview`
  - `status`
  - `provider_status`
  - `error_message`
  - `created_at`
- Cela permettra enfin de voir pourquoi un appareil n’a pas reçu une notif, même après coup.

5. Fiabiliser le flux WhatsApp entrant
- Modifier `whatsapp-webhook/index.ts` pour:
  - enregistrer le message entrant
  - déclencher le push vers tous les appareils actifs du propriétaire
  - attendre le résultat du push assez longtemps pour le loguer proprement
  - stocker la source `whatsapp_inbound` dans l’historique
- Important: l’app ouverte continuera à être instantanée via realtime; le push couvrira le Mac/iPhone quand l’app est en arrière-plan ou fermée.

6. Refaire la page de diagnostic “Notifs”
- Transformer `SettingsTestsPage.tsx` en vrai centre de diagnostic:
  - bloc “Appareil courant”
  - bloc “Appareils enregistrés”
  - bouton “Envoyer à tous”
  - bouton “Envoyer aux sélectionnés”
  - bouton “Réparer la souscription de cet appareil”
  - statut santé par appareil:
    - actif / invalide / permission bloquée
    - dernier seen
    - dernier succès
    - dernière erreur
  - historique visible des derniers envois backend
- Ajouter un test dédié “Simuler un WhatsApp entrant” pour valider tout le flux.

7. Vérification finale de bout en bout
- Cas 1: Mac + iPhone connectés, app ouverte sur les deux
  - le message WhatsApp apparaît instantanément dans l’interface via realtime
- Cas 2: app fermée / en arrière-plan
  - la notif arrive sur Mac et iPhone en quelques secondes
- Cas 3: bouton “Envoyer à tous”
  - 2 lignes de log minimum, une par appareil
- Cas 4: bouton “Envoyer aux sélectionnés”
  - seuls les appareils cochés reçoivent

Détails techniques
```text
WhatsApp inbound
   -> webhook reçoit message
   -> insert whatsapp_messages
   -> send-push(target=all active devices)
   -> log par appareil
   -> UI ouverte = realtime instantané
   -> UI fermée = push système
```

Ce que je ferai en implémentation si tu valides
1. Migration DB pour enrichir `push_subscriptions` + créer la table d’historique.
2. Refactor de `usePushNotifications.ts` pour sync/heartbeat stable.
3. Refactor de `send-push/index.ts` pour logs + ciblage fiable.
4. Refactor de `whatsapp-webhook/index.ts` pour brancher le push traçable.
5. Refonte de `SettingsTestsPage.tsx` pour le diagnostic complet.
6. Test complet Mac/iPhone + test WhatsApp entrant réel.

Résultat attendu après ce chantier
- Tu verras toujours tes appareils connectés de manière cohérente.
- Tu pourras choisir “tous” ou “certains” appareils.
- Tu auras un log clair pour chaque tentative.
- Les messages WhatsApp entrants seront instantanés:
  - dans l’app via realtime si elle est ouverte
  - en notification système sur Mac/iPhone si elle est en arrière-plan ou fermée.
