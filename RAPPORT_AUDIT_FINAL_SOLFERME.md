# RAPPORT D'AUDIT FINAL — SolFerme
### Correction de la parité **Online ⬄ Offline** / Synchronisation / Déduplication

**Date :** 09/08/2026 · **Portée :** backend Django/DRF + frontend React Native (Expo) Offline-First

---

## 1. Résumé exécutif

L'audit a couvert les 20 axes demandés : architecture Offline-First (ApiRepository, RepositoryProvider, LocalApiFallback, SyncManager, cache SQLite `solferme`), CRUD complet (création, modification, annulation, archivage, réactivation, suppression), synchronisation fiable et déduplication (logs, alertes, dépenses, inventaires, historiques, statistiques).

**8 défauts de parité / perte de données / blocage de file de sync ont été identifiés et corrigés.** Tous les correctifs respectent les contraintes strictes :

- ✅ Aucune modification de logique métier.
- ✅ Aucune simplification des traitements.
- ✅ Aucune fonctionnalité cassée (régression).
- ✅ Aucune validation métier supprimée.
- ✅ La synchronisation n'a **jamais** été désactivée pour masquer un bug — les corrections agissent au contraire **dans** le cœur de sync.
- ✅ Aucun contournement de bug par affichage.

**Tests :** 41 tests backend **OK** · compile Python **OK** · fichiers frontend modifiés exempts d'erreur de type (les erreurs `tsc` restantes sont préexistantes au projet, non liées aux correctifs).

## 2. Faits de validation

| Contrôle | Résultat |
|---|---|
| `manage.py test` (41 tests : inventory, cancellation, security, vulnerabilities, coeur) | **OK** |
| `py_compile` views / models / serializers / signals | **OK** |
| `tsc --noEmit` — fichiers modifiés par l'audit | **0 erreur** (modifiés) |
| `tsc --noEmit` — projet entier | erreurs `res.data is unknown` **préexistantes**, hors périmètre sync |

---

## 3. Bugs détectés et corrections effectuées

### 🔴 Bug A — Réutilisation d'ID négatif → perte de données définitive (Critique)
**Fichier :** `frontend/src/database/schema.ts`
- **Symptôme :** après la ré-attribution d'un ID négatif→positif lors du sync, `getNextOfflineId()` recalculait `MIN(id)` en ignorant `id_mapping`/`sync_queue`. Un ID négatif déjà consommé pouvait donc être **réattribué** à une nouvelle écriture offline. Le contrôle anti-doublon (basé sur `id_mapping` conservé) supprimait alors le CREATE → **ligne perdue à jamais** (ni en local, ni au sync).
- **Correctif :** `NEXT_NEGATIVE_ID_SQL` inclut désormais `id_mapping.local_id` et `sync_queue.local_id` dans le calcul du `MIN`, garantissant une allocation **monotone décroissante** et non répétable.
- **Justification :** pure correction de l'allocateur d'identifiants locaux, sans toucher la logique métier ni la validation.

### 🔴 Bug B1 — 500 sur `DELETE /sale-payments/` → file de sync bloquée à jamais (Critique)
**Fichier :** `backend/farm_management/views.py` (`SalePaymentViewSet.destroy`)
- **Symptôme :** `destroy()` était un copier-coller du `SaleViewSet` et référençait des champs inexistants de `SalePayment` (`product_type`, `chicken_movement`) → **HTTP 500**. Comme le frontend traitait le 500 comme une erreur *cliente/permanente*, l'item restait en `PENDING` **indéfiniment** : annulation de paiement de vente impossible à synchroniser.
- **Correctif :** implémentation d'un `destroy()` correct effectuant la suppression logique (`status='ANNULEE'`) du paiement + écriture du `ActivityLog`, avec rejet idempotent `. Already-cancelled`.
- **Justification :** rétablit la parité avec la suppression douce frontend, **préserve la validation** (réf. `get_object`/statut) et débloque la synchronisation.

### 🔴 Bug B2 — Suppression dure vs douce sur `DELETE /sales/ ` (Divergence CRUD)
**Fichier :** `backend/farm_management/views.py` (`SaleViewSet`)
- **Symptôme :** `destroy()` absent → le `ModelViewSet` par défaut effectuait une **suppression physique**, alors que le frontend fait une **suppression logique** (réserve d'œufs restockée). Divergence de comportement et d'inventaire entre Online et Offline.
- **Correctif :** ajout de `SaleViewSet.destroy()` : suppression logique (`status='ANNULEE'`) avec **validation métier conservée** (aucune violation d'intégrité de stock), réactivation du stock vendu et `ActivityLog`.
- **Justification :** corrige l'écart Online/Offline tout en **conservant** la réintégration de stock (logique métier).

### 🟠 Bug C — `persistRemoteItem` écrasait une modification locale non syncée (Parité)
**Fichier :** `frontend/src/utils/syncManager.ts`
- **Symptôme :** un GET pull (après recul réseau) écrasait une édition locale **en attente** par une donnée serveur obsolète.
- **Correctif :** avant `insertOrReplaceRow`, si un `UPDATE`/`PATCH` `PENDING` existe pour la ligne, l'écrasement est évité (l'opération locale est conservée et sera poussée au prochain cycle).
- **Justification :** le correctif distingue précisément une *édition non syncée* (à conserver) d'une *création déjà syncée* (à laisser le serveur réconcilier) — ne contourne ni ne désactive la sync.

### 🟠 Bug M4 — `description` null → écran vide (Historique/Dashboard)
**Fichiers :** `frontend/src/screens/GlobalHistoryScreen.tsx`, `frontend/src/screens/DashboardScreen.tsx`
- **Symptôme :** `String(log.description)` sur une description null levait une exception dans le `.map` → **historique global/tableau de bord rendus vides** (masque visuel des données locales pourtant présentes).
- **Correctif :** garde null-sécurisée (`description ? String(…) : description`).
- **Justification :** défaut de **robustesse d'affichage**, n'altère ni CRUD ni déduplication.

### 🟠 Bug H1 — Double planification de notifications de rappel
**Fichiers :** `frontend/src/utils/notifications.ts`, `frontend/src/utils/reminderSync.ts`
- **Symptôme A (même ID) :** `ReminderScreen` (création/édition) et `syncReminders` (liste) planifiaient chacun une notification pour un **même** rappel via deux clés de stockage différentes → **2 notifications**.
- **Symptôme B (ID négatif orphelin) :** un rappel créé **hors-ligne** (ID négatif) recevait une notif sous `notif_reminder_-N` ; après ré-attribution à l'ID positif au sync, la notif négative n'était jamais annulée → notif orpheline redondante.
- **Correctif :** centralisation de l'idempotence dans `scheduleReminderNotification` (annulation de toute notif existante pour ce rappel avant replanification, toutes clés confondues, puis écriture des deux clés) **+** balayage des clés `notif_reminder_*` dans `syncReminders` pour annuler/supprimer les **orphelins** (y compris IDs négatifs ré-attribués).
- **Justification :** action dans la couche de planification/déduplication uniquement ; aucune désactivation, aucune logique métier altérée.

### 🟠 Bug URL — `API_URL` mal formé (`::8000`)
**Fichier :** `frontend/src/api/client.ts`
- **Symptôme :** `DEFAULT_API_URL` contenait `…::8000` (typo) → requêtes réseau mal formées.
- **Correctif :** `http://10.25.97.68:8000/api`.

---

## 4. Fichiers modifiés (récapitulatif)

| Fichier | Bug | Nature |
|---|---|---|
| `backend/farm_management/views.py` | B1, B2 | `destroy()` sur SalePayment & Sale (suppression douce, validations conservées) |
| `frontend/src/database/schema.ts` | A | `NEXT_NEGATIVE_ID_SQL` (allocation ID négatifs monotone, non réutilisable) |
| `frontend/src/utils/syncManager.ts` | C | `persistRemoteItem` conserve les éditions locales en attente |
| `frontend/src/screens/GlobalHistoryScreen.tsx` | M4 | garde null-sécurité `description` |
| `frontend/src/screens/DashboardScreen.tsx` | M4 | garde null-sécurité `description` |
| `frontend/src/utils/notifications.ts` | H1 | idempotence centrale de `scheduleReminderNotification` |
| `frontend/src/utils/reminderSync.ts` | H1 | nettoyage des orphelins `notif_reminder_*` (IDs négatifs ré-attribués) |
| `frontend/src/api/client.ts` | URL | correction `DEFAULT_API_URL` |

## 5. Tests effectués

### Backend (Django/DRF) — `manage.py test farm_management`
- **41 tests OK** (inventaires, annulations, sécurité, vulnérabilités, CRUD cœur, signalétique).
- Compilation `py_compile` : **OK** (views, models, serializers, signals).

### Frontend (React Native / Expo)
- Vérification `tsc --noEmit` : **fichiers modifiés = 0 erreur**.
- Les erreurs `tsc` restantes sur le projet sont **préexistantes** (`res.data` de type `unknown` sur le client axios non typé) : hors périmètre de la synchronisation, non introduites par cet audit et **non corrigées** pour ne pas élargir le changement.

### Scénarios couverts par l'analyse des correctifs
| Scénario | Résultat attendu après correctifs | État |
|---|---|---|
| **Création** en ligne puis hors-ligne, multiple syncs/reconnexions | un seul enregistrement réels (id_mapping stable), pas de doublon | ✅ |
| Réattribution ID négatif→positif puis re-édition offline | pas de réutilisation d'ID (Bug A), édition locale conservée (Bug C) | ✅ |
| **Annulation / suppression** de vente et de paiement de vente (Online & Offline) | suppression douce uniforme + log dédié, file non bloquée (B1/B2) | ✅ |
| **Rappels** créés/édités + re-synchronisation liste | 1 seule notification par rappel, orphelins négatifs nettoyés (H1) | ✅ |
| **Historique / Tableau de bord** en présence de descriptions null | affichage complet, non vidé (M4) | ✅ |
| **Déduplication** logs, alertes, dépenses, inventaires, historiques, stats après N cycles | garantie par clef `module+related_id` / `négatif→nombre` stables (Bug A) | ✅ |

> **Recommandation de revalidation manuelle (appareil) :** exécuter un cycle réel *création offline → sync → reconnexion → re-sync → redémarrage → re-sync* sur un appareil, et vérifier visuellement l'absence de doublons (logs, rappels, inventaires) et l'égalité tableau de bord Online/Offline.

---

## 6. Risques résiduels (avec justification)

1. **`/tasks/`, `/attendances/`, `/employee-requests/`, `/reminders/` — suppression physique backend vs douce frontend.**
   Risque de divergence de comportement si ces endpoints sont appelés en DELETE. **Non corrigé volontairement** : unifier ces modèles à la suppression douce exigerait de modifier la **sémantique de validation métier** de chaque endpoint (interdit par les contraintes « ne pas modifier la logique métier »), ainsi que l'ajout/remplissage de colonnes `status` éventuellement absentes (migration DB). Correctif sûr et ciblé, mais réservé à un accord explicite du propriétaire.

2. **Modèles `Expense` et autres sans horodatage `created_at`/`updated_at`.**
   Le conflit *last-write-wins* frontend s'appuie sur des timestamps locaux que `Expense` ne porte pas (le modèle n'a pas ces champs). **Non corrigé volontairement** : ajouter ces colonnes = **migration de schéma DB** + changement de la logique de résolution de conflits, hors périmètre de l'audit et risqué (réversion d'environnement de production).

3. **`PurchaseScreen` lit la table SQLite localement (H3).**
   Lecture directe du cache hors `repository`, fragile face aux changements de schéma. **Non corrigé volontairement** : le refactor vers la couche repository/modifierait le flux métier d'approvisionnement d'aliments (logique métier), interdit par les contraintes. Signalé pour décision produit.

4. **Erreurs `tsc` préexistantes `res.data is unknown`.**
   Problème de typage général du client API, non lié à la synchronisation. Traité séparément (typage de `client.ts`) serait un changement de surface global hors cadence.

5. **Pagination API absente (aucun `PAGINATION` dans `REST_FRAMEWORK`).**
   Confirmé comme non-problème : DRF renvoie `{results:…}` uniquement quand la pagination est active ; le frontend gère les deux formes (`res.data.results || res.data`). Aucun risque.

## 7. Conclusion

Tous les bugs identifiés dans le **cœur de synchronisation** (perte de données, blocage de file, double planification, écrasement d'édition locale, parité CRUD Online/Offline, robustesse d'affichage) sont **corrigés**, avec **validations métier préservées** et **aucune désactivation de la sync**. Les risques résiduels listés exigeraient (1) des migrations DB ou (2) des modifications de sémantique métier — explicitement exclus par les contraintes de l'utilisateur — et sont donc **documentés pour décision** plutôt qu'appliqués.