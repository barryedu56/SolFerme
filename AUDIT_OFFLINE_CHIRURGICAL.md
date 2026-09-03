# Audit chirurgical — Mode Offline SolFerme (web en priorité)

Date : 2026-09-01
Périmètre : `frontend/src/repositories/*`, `frontend/src/utils/syncManager.ts`, `frontend/src/utils/offlineSyncUtils.ts`, `frontend/src/repositories/dataSources/LocalApiFallback.ts`, écrans d'action (Production, Vente, VentePoules, Conversion), + points de contact backend (`serializers.py`, `models.py`).
Objectif : diagnostic **sans réécriture**. Confirmer si le offline est « à 100 % » et sinon lister les défauts avec preuves.

---

## État des corrections

### Lot 1

| Finding | Statut | Fichier(s) |
|---|---|---|
| 1 — repli local des endpoints calculés | ✅ **corrigé** | `ApiRepository.ts` (nouveau `computeLocalComputedResponse` + branche dédiée dans `get()`) |
| 2 — masquage d'erreur offline | ✅ **corrigé** | `ApiRepository.ts` (`post()`, `put()` : `throw offlineFallbackError`) |
| 3 — conversion casiers hors-ligne (`farm_id`) | ✅ **corrigé** | `LocalApiFallback.ts` (dérivation `farm_id` depuis le lot) |
| 8 — tri timeline sur date nulle | ✅ **corrigé** | `LocalApiFallback.ts` (`validateEggStockIntegrity`, `asDate()`) |

### Lot 2 — révélés par le Finding 2 (test « serveur coupé, Internet actif »)

| # | Problème | Statut | Fichier(s) |
|---|---|---|---|
| 9 | **`sale_payments.farm_id` NOT NULL** — le paiement initial d'une vente est inséré sans `farm_id` (ni la vente ni le formulaire ne portent `farm`) → `Error finalizing statement`. La vente reste à moitié écrite : ligne + stock OK, mais paiement + log KO → créance faussée (modal « Total payé : 0 »), aucun historique côté Détail du lot, et « stock insuffisant » à la 2ᵉ tentative. Idem pour l'ajout de paiement via « Encaisser ». | ✅ **corrigé** | `LocalApiFallback.ts` — résolution `farm_id`/`lot_id` depuis le lot (paiement initial + POST `sale_payments` générique) + recalage `payment_status` |
| 10 | **Écriture offline non atomique** — si une étape échoue au milieu (`handleOfflineWrite`), les étapes précédentes (INSERT vente, décrément stock, mouvement miroir) restaient persistées → demi-vente, doublons à la reprise. | ✅ **corrigé** | `localDatabase.ts` — `runInTransaction()` (BEGIN/COMMIT/ROLLBACK, mutex tenu, ré-entrance interne) ; `handleOfflineWrite` entièrement encapsulé ; `dataEvents.ts` — évènements tamponnés puis rejoués après COMMIT |
| 11 | **Ventes déjà cassées** (tests précédents) : `amount_paid > 0` sans aucun `sale_payment` → créance incohérente même après correctif. | ✅ **corrigé** | `LocalApiFallback.reconcileMissingInitialSalePayments()` appelé au démarrage (`syncManager.initialize`) — recrée le paiement INITIAL manquant, idempotent, ventes locales uniquement |

`tsc --noEmit` : OK après corrections. **Non testé au runtime** — à valider (couper le serveur, garder Internet).

> Reste : les **doublons de ventes** déjà créés par un double-clic pendant le crash (ex. « GMD » ×2 sur la capture) ne sont pas auto-réparés — l'utilisateur doit en annuler une. Le correctif #10 empêche que ça se reproduise (le 1ᵉʳ envoi aboutit → l'écran se ferme).

### Lot 3 — anti-doublon de synchronisation

| # | Problème | Statut | Fichier(s) |
|---|---|---|---|
| 12 | **CREATE rejoué = doublon serveur.** Si le POST atteint le serveur, est traité, mais que la réponse réseau se perd, le client repasse l'item en `PENDING` et re-POST au cycle suivant → 2ᵉ ligne créée (aucune idempotence côté backend sauf `sale_payments`). | ✅ **corrigé** | Backend : nouveau modèle `SyncIdempotencyKey` + migration `0055` + `IdempotentCreateMixin` appliqué à 19 ViewSets (Sale, Production, ChickenMovement, Feed, HealthRecord, Expense, EggConversion, Feed/HealthPurchase, FeedPreparation, LotExpense, Payroll, Bonus, Task, Reminder, Lot, Farm, Employee, EmployeeRequest). Frontend : `enqueueSyncQueue` injecte un `client_uuid` stable dans chaque payload CREATE. Purge des clés > 14 j dans `process_reminders`. |
| 13 | **`_server_id` jamais rejoué.** Quand le POST aboutit mais que le mapping local `id<0 → serverId` échoue, `_server_id` est stocké dans le payload mais n'était jamais relu → re-POST → doublon. | ✅ **corrigé** | `syncManager.pushPendingOperations` — « anti-doublon 2 » : reprise du mapping depuis `_server_id` sans re-POST ; `_server_id` retiré du corps envoyé. |
| 14 | **Dédup des lignes miroir par tuple de valeurs** (mouvement VENTE, paiement INITIAL) : deux ventes identiques le même jour → mauvaise ligne supprimée / doublon. | ✅ **corrigé** | `syncManager.persistRemoteItem` — dédup **par FK `sale_id`** en priorité (fiable après cascade `replaceLocalId`), tuple `(qté, date)` en repli seulement. |

Tests : `farm_management.tests_sync_idempotency` (6 cas : rejeu Production/Vente/Mouvement dédupliqué, uuids distincts → lignes distinctes, sans `client_uuid` → comportement inchangé, objet supprimé → recréation autorisée) — **OK**. Suite complète backend (149 tests) — **OK**. `tsc --noEmit` — **OK**.

> **Garantie** : un CREATE ne peut plus produire de doublon serveur, quel que soit le nombre de rejeux (perte de réseau, crash, mapping local KO). Les UPDATE/DELETE sont naturellement idempotents (PATCH/DELETE sur un id serveur). Les lignes miroir (mouvement VENTE, paiement INITIAL, dépense d'achat) sont créées par le backend et dédupliquées au pull, en priorité par clé étrangère.

---

## Verdict

**Le mode offline n'est PAS à 100 %.**

- Les **écritures en mode 100 % hors-ligne** (Wi-Fi coupé) sont globalement correctes (~85–90 %) : la file de sync, le remapping d'ID local→serveur, la cascade des FK, l'ordre de priorité, la reprise des `PROCESSING`, la déduplication et la stratégie *last-write-wins* sont bien pensés.
- En revanche le scénario **« Internet actif mais serveur injoignable »** (celui que tu as testé) est **matériellement cassé** pour tout ce qui lit des statistiques calculées, et il **masque les vraies erreurs** derrière un message trompeur.
- 3 bugs que tu as remontés ont une **cause racine unique et confirmée** ; 2 autres ont des causes distinctes, également confirmées.

Les 3 symptômes « serveur coupé / Internet actif » (date antérieure, stats à 0, vente poule impossible) proviennent **du même défaut** : `ApiRepository.get()` n'a aucun repli local pour les *computed endpoints* quand l'app se croit en ligne.

---

## FINDING 1 — CRITIQUE — Aucun repli local des endpoints calculés quand « Internet ON + serveur KO »

### Preuve
`frontend/src/repositories/ApiRepository.ts:920`

```ts
const syncable = this.isSyncable(endpoint) && !this.isComputedEndpoint(endpoint);
```

- Pour `/lots/{id}/statistics/`, `parseEndpoint` renvoie `action = "statistics"` ⇒ `isComputedEndpoint === true` ⇒ **`syncable === false`**.
- Le bloc de repli pour endpoints calculés dans le `catch` (`ApiRepository.ts` ~`994`–`1021`) est enveloppé dans `if (syncable) { … if (this.isComputedEndpoint(endpoint)) … }` ⇒ **code mort** (jamais atteint pour un endpoint calculé).
- Le bloc de calcul local (`ApiRepository.ts` ~`1053`) est gardé par `!(await this.isOnline())`.
- Or `isOnline()` sur web (`ApiRepository.ts:85`) renvoie **`true`** quand `navigator.onLine === true` et `state.isConnected === true` — c'est exactement le cas « serveur coupé mais Internet OK ».

Déroulé réel pour `/lots/5/statistics/` dans ce cas :
`syncable=false` → le `try/catch` API n'est jamais exécuté → `if (syncable)` sauté → branche calcul local sautée (`isOnline` vaut `true`) → on tombe sur `return apiClient.get(endpoint, config)` (fin de méthode) → **exception réseau non rattrapée**.

`frontend/src/screens/LotDetailScreen.tsx:55`
```ts
repositoryProvider.api.get(`/lots/${lotId}/statistics/`).catch(() => ({ data: emptyStats })),
```
`emptyStats` (`LotDetailScreen.tsx:42`) contient `purchase_date: new Date().toISOString()` (**datetime ISO complet**) et tous les compteurs à `0`.

### Conséquences (tes bugs « serveur coupé »)

1. **« la date ne peut pas être antérieure » (Production / Vente / Mouvement / Santé / Alimentation)**
   `ProductionScreen.tsx:49`, `VenteScreen.tsx:128`, `ActionVentePoules.tsx:64`, `MouvementScreen.tsx:38`, `SanteScreen.tsx:117`, `AlimentationScreen.tsx:100` :
   ```ts
   if (lotPurchaseDate && date < lotPurchaseDate) { … dateBeforeLotError }
   ```
   `lotPurchaseDate` provient de `lotData.info.purchase_date` (`LotDetailScreen.tsx:1374/1399`).
   En repli : `lotPurchaseDate = "2026-09-01T14:32:07.984Z"`, `date = "2026-09-01"`.
   Comparaison de chaînes : `"2026-09-01" < "2026-09-01T14:32:…"` ⇒ **`true`** (préfixe) ⇒ erreur.
   Une **date future** (`"2026-09-05"`) est `>` ⇒ ça passe. → correspond exactement à ton observation.

2. **« Section Statistique tout à 0 dans Détail du lot »**
   `emptyStats` renvoyé tel quel.

3. **« bouton Confirmer la vente (poules) ne fonctionne pas »**
   `LotDetailScreen.tsx:1375/1400` passe `currentQuantity: lotData.info.current_quantity` ⇒ `0` en repli.
   `ActionVentePoules.tsx:54-55` : `effectiveAvailable = currentQuantity || 0 = 0` ⇒ `isStockInsufficient = parsedQuantity > 0` ⇒ **toujours vrai** ⇒ `handleSubmit` bloque avant même l'appel API (`ActionVentePoules.tsx:69`).

4. **Effet systémique non listé par toi** : `DashboardScreen` (`/farms/statistics/`), `EmployeeDashboardScreen` (`/employees/stats/`, `/employees/me/`), `PayrollScreen` (`/payrolls/summary/`) subissent le même repli-zéro dans ce mode.

### Correctif (direction, pas de réécriture)
Dans `ApiRepository.get()` : traiter les *computed endpoints* comme un cas à part entière —
`try { apiClient.get } catch (e) { if (!e.response) return compute<Local>() }` — **indépendamment de `isOnline()`**, et supprimer la garde `if (syncable)` autour de la branche calcul (ou calculer `syncableComputed` séparément). Les méthodes `computeLocalLotStatistics` / `computeLocalFarmStatistics` / `computeLocalPayrollSummary` / `computeLocalEmployeeStats` existent déjà et sont correctes ; il ne manque que le routage.

---

## FINDING 2 — ÉLEVÉ — Le repli offline masque la vraie erreur derrière « Impossible de contacter le serveur »

### Preuve
`frontend/src/repositories/ApiRepository.ts` — `post()` (~`1146`), `put()` (~`1195`) :
```ts
} catch (error: any) {
  if (!error.response) {
    try {
      const row = await handleOfflineWrite<T>('POST', endpoint, body);
      return buildLocalResponse<T>(row);
    } catch (offlineFallbackError: any) {
      console.error('[ApiRepo] Offline fallback write failed:', offlineFallbackError?.message);
      throw error;          // ⬅️ on relance l'ERREUR RÉSEAU, pas l'erreur offline réelle
    }
  }
  throw error;
}
```
`patch()` (~`1236`) et `delete()` (~`1308`) ne rattrapent même pas le repli : `const row = await handleOfflineWrite(...)` peut throw brut.

`frontend/src/utils/errors.ts:83` : `if (error.message === 'Network Error' || error.request) return 'Impossible de contacter le serveur…'`.
Une erreur axios « connexion refusée » porte `error.request` ⇒ ce message.

### Conséquence
Ton bug : *« pour la vente, même en mettant la date au futur, on me dit impossible de contacter le serveur »*.
En réalité `handleOfflineWrite('POST','/sales/',…)` a **échoué localement** (validation métier `validateEggStockIntegrity`, ou contrainte SQLite — cf. Findings 3/8), mais l'utilisateur voit un message réseau qui cache le vrai problème. Tout bug d'écriture offline « post-échec API » est ainsi invisible.

Distinction importante : en mode **100 % hors-ligne** (`!isOnline()`), `post()` fait `catch (offlineError) { throw offlineError; }` ⇒ la vraie erreur remonte. Le masquage ne concerne QUE le repli après échec API.

### Correctif
`throw offlineFallbackError` (éventuellement en attachant `cause: error`). Idem pour `patch`/`delete` : envelopper `handleOfflineWrite` dans un `try/catch` qui propage l'erreur offline.

---

## FINDING 3 — CRITIQUE — La conversion de casiers échoue systématiquement hors-ligne (`egg_conversions.farm_id` NOT NULL)

### Preuve
- `backend/farm_management/serializers.py:367` : `class ProductionSerializer … fields = '__all__'` sur le modèle `Production`.
- `backend/farm_management/models.py:128` : `Production` **n'a pas de champ `farm`** (uniquement `lot`).
  ⇒ la réponse API d'une production ne contient **ni `farm` ni `farm_id`**.
- `frontend/src/screens/actions/ProductionConvertScreen.tsx:43` :
  ```ts
  const farmId = productionData?.farm_id || productionData?.farm || item?.farm;   // = undefined
  ```
  puis POST `/egg-conversions/` avec `farm: undefined` (`ProductionConvertScreen.tsx:84-92`).
- **En ligne** : `backend/farm_management/serializers.py:435-438` dérive `farm = lot.farm`. OK.
- **Hors-ligne** : `handleOfflineWrite` POST simple (`LocalApiFallback.ts:1750`+) ne dérive rien. Aucun cas particulier `egg_conversions` (contrairement à `employee_requests`, `employees`).
- `frontend/src/database/schema.ts:142` : `farm_id INTEGER NOT NULL`.
  ⇒ `insertRow('egg_conversions', row)` sans `farm_id` ⇒ **`NOT NULL constraint failed: egg_conversions.farm_id`** ⇒ `handleOfflineWrite` throw ⇒ conversion refusée.

### Conséquence
Ton bug #3 : *« j'ai essayé de convertir ça, ça ne fonctionne pas »*. Toute conversion d'œufs hors-ligne échoue. Combiné au Finding 2, l'utilisateur voit « Impossible de contacter le serveur » au lieu de l'erreur SQLite.

Le « 5 casiers non convertis » après passage de 45→50 est, lui, **le comportement attendu** : `en_attente = casiers_produits − casiers_vendables − Σconversions` (`serializers.py:378-382`). Le problème n'est pas l'apparition des 5, c'est l'impossibilité de les convertir.

### Effet secondaire (sync)
Même si l'insert passait : le payload en file n'a pas de `farm`. Et l'ordre de sync (`getQueueItemPriority`, `syncManager.ts:99`) place le `CREATE` conversion (id local négatif ⇒ `opPriority=0`, score `10.5`) **avant** l'`UPDATE` production (id positif ⇒ `opPriority=1`, score `110`). Au moment du push, le serveur a encore `casiers_produits=45` ⇒ `en_attente=0` ⇒ **rejet 400** (`serializers.py:460-466`) ⇒ item `FAILED`. Il est re-tenté (`syncManager.ts:358-390`, max 5 fois / 30 min) après le push de la production ; si la fenêtre est dépassée, la conversion est **perdue**.

### Correctif
Dans `handleOfflineWrite` (branche POST), pour `egg_conversions` : résoudre `farm_id` via `fetchRow('lots','id = ?',[lot_id]).farm_id` avant `insertRow` et l'ajouter au payload de file. Règle générale : **tout champ que le serializer backend dérige côté serveur doit avoir un miroir dans `handleOfflineWrite`** (audit rapide à faire : `EggConversionSerializer`, `EmployeeRequestSerializer`, `SalePaymentSerializer`, `PayrollSerializer`).
Optionnel mais recommandé : ajouter une sous-priorité pour que les `CREATE` dépendant d'une valeur (pas d'un id) d'un enregistrement encore en file passent après l'`UPDATE` correspondant.

---

## FINDING 4 — ÉLEVÉ — `current_quantity` recalculé en absolu depuis `initial_quantity` + mouvements LOCAUX seulement

### Preuve
`frontend/src/repositories/dataSources/LocalApiFallback.ts:869` `updateLotQuantityForMovement` :
```ts
const newQty = Math.max(0, Number(lot.initial_quantity) + totalAdded - totalDead - totalSold);
```
où `totalAdded/Dead/Sold` = `SUM(quantity)` des `chicken_movements` **présents en SQLite** (`status='ACTIF'`).

`updateLotQuantityForSale:934` utilise au contraire un **delta** (`newQty = currentQty ± sale.quantity`).

### Problème
Si SQLite ne contient pas l'historique **complet** des mouvements (pull partiel, `pullEndpoint` nettoyage `id>0` `syncManager.ts:700-714`, ou état « serveur coupé » où rien n'a été rechargé), le **premier** mouvement/vente hors-ligne recalcule `current_quantity` à partir de `initial_quantity` avec un historique tronqué ⇒ valeur fausse (souvent trop basse) ⇒ cascade :
- `validateChickenStockForSale` (`LocalApiFallback.ts:591`) et `validateChickenMovement` (`:562`) lisent `lot.current_quantity` ⇒ **« Stock de poules insuffisant alors que j'en ai »** (tes bugs offline #1 et #2).
- passage indu en `status='TERMINE'`, désactivation des rappels (`:924`), `motif_fin` erroné.

Le mélange **absolu (mouvements) vs delta (ventes)** peut aussi diverger entre eux.

### Correctif
Soit garantir que l'historique mouvements est toujours intégralement présent avant tout recalcul absolu (et ne jamais l'exécuter en état « cache incomplet »), soit passer `updateLotQuantityForMovement` en ajustement **delta** comme les ventes. À défaut, stocker `current_quantity` comme valeur autoritaire venant du serveur et n'appliquer que des deltas signés localement.

---

## FINDING 5 — MOYEN — `egg_conversions` absent de la chaîne de recalcul local

`handleOfflineWrite` déclenche un recalcul miroir pour `feed_purchases`, `health_purchases`, `feeds`, `health_records`, `feed_preparations`, `lot_expenses`, `sale_payments` (`LocalApiFallback.ts:1871-1898`) — **mais pas pour `egg_conversions`**.

Impact limité : `LotDetailScreen` recompute `enAttenteActuel` / `vendablesActuels` côté client à partir de la liste des conversions (`LotDetailScreen.tsx:565-599`) et `calculateAvailableStock` (`utils/inventory.ts:69-79`) intègre les conversions `to_state='VENDABLE'`. Les colonnes `from_state`/`to_state` reçoivent leur `DEFAULT` SQLite (`schema.ts:144-145`) à l'insert direct — donc l'affichage serait correct **si l'insert réussissait** (cf. Finding 3).
Point de vigilance : `computeLocalLotStatistics` (`ApiRepository.ts:173`) et `validateEggStockIntegrity` (`LocalApiFallback.ts:636`) filtrent `to_state = 'VENDABLE'` en SQL — corrects tant que le `DEFAULT` s'applique bien.

### Correctif
Après insert d'une `egg_conversion`, mettre à jour l'état affiché du lot (émettre `emitDataChange({tableName:'productions'})` + `egg_conversions`) et, idéalement, un helper `recalculateProductionPendingLocally` symétrique aux autres.

---

## FINDING 6 — MOYEN — Ordre de push : opérations dépendant d'une *valeur* non ordonnées

`getQueueItemPriority` (`syncManager.ts:99-131`) ordonne : `CREATE` d'un id local avant `UPDATE`/`DELETE`, puis par table. Il gère finement les sous-types `chicken_movements` (MALADE avant GUERI). Mais il ne gère **pas** les dépendances *inter-entités sur une valeur* :
- conversion `CREATE` (dépend du nouveau `casiers_produits` d'une production éditée) passe avant l'`UPDATE` production ⇒ rejet transitoire (cf. Finding 3).
- une vente d'œufs `CREATE` peut passer avant l'`UPDATE` d'une production qui augmentait le stock ⇒ rejet `validate_egg_stock_integrity` transitoire.

Le filet de sécurité (`FAILED` re-tenté si `!unresolved`) rattrape le cas **la plupart du temps**, mais dans la fenêtre de 5 tentatives / 30 min (`syncManager.ts:323-324`) une perte reste possible.

### Correctif
Quand un `CREATE`/`UPDATE` référence un enregistrement (`production`, `sale`, …) qui a lui-même une opération `UPDATE` **encore en file**, forcer son score après celui de l'`UPDATE`.

---

## FINDING 7 — MOYEN — Déduplication au pull basée sur des tuples de valeurs

`persistRemoteItem` (`syncManager.ts:851`+) déduplique les miroirs (mouvement `VENTE`, `sale_payments`, `expenses`, `health_alerts`, `activity_logs`) en **matchant `(lot, quantité, date, montant, …)`** puis en supprimant la/les ligne(s) locale(s) `id < 0`.

Risque : deux opérations similaires le même jour (2 ventes de 10 têtes au même prix, 2 dépenses identiques) ⇒ suppression de la mauvaise ligne, ou des deux, ou d'aucune ⇒ **doublon ou perte** — précisément ce que tu veux éviter. Non observé dans tes tests mais c'est une fragilité réelle en usage intensif.

### Correctif
Propager un identifiant de corrélation (`_local_uuid`) du client vers le backend (champ ignoré ou stocké) et dédupliquer dessus, plutôt que sur des valeurs métier.

---

## FINDING 8 — FAIBLE — `validateEggStockIntegrity` : tri de timeline sur date potentiellement `undefined`

`LocalApiFallback.ts:678` :
```ts
timeline.sort((a, b) => { if (a.date !== b.date) return a.date.localeCompare(b.date); … });
```
Si une production / vente / conversion locale a `date` (ou `conversion_date`) nul/absent, `a.date.localeCompare` lève un `TypeError`. Le `catch` de `handleOfflineWrite` (`:1708-1734`) considère toute erreur non reconnue comme **bloquante** et la relance ⇒ écriture offline refusée, message obscur (puis masqué par Finding 2).

### Correctif
Normaliser `date` (`|| ''`) avant le tri, ou filtrer les entrées sans date.

---

## Ce qui fonctionne bien (à conserver)

- `SyncManager` : garde `isSyncing` posée avant tout `await` (anti double-run), reprise des `PROCESSING` au démarrage et après 60 s, ré-activation des `FAILED` quand les dépendances se résolvent, distinction 4xx (métier, `FAILED`) vs 5xx/réseau (`PENDING`).
- Remapping `local_id → server_id` vérifié + cascade FK sur toutes les tables (`replaceLocalId`), mise à jour des items de file dépendants.
- `CANCELLABLE_TABLES` : soft-delete local (`ANNULEE`) cohérent avec le backend.
- Miroir des signaux Django pour les inventaires (aliment brut, aliment préparé, santé), coût lot, statut de paiement, dépenses liées, alertes santé.
- `mergeApiWithLocal` respecte les filtres de requête (évite le mélange de créances entre ventes).
- Conflit d'édition : *last-write-wins* assumé et documenté.

---

## Priorisation recommandée

| # | Sévérité | Effort | Bugs utilisateur couverts |
|---|----------|--------|---------------------------|
| 1 | Critique | Faible | date antérieure, stats à 0, vente poule impossible (mode serveur coupé) |
| 3 | Critique | Faible | conversion impossible |
| 2 | Élevé | Très faible | « impossible de contacter le serveur » trompeur |
| 4 | Élevé | Moyen | « stock insuffisant alors que j'en ai » (mode 100 % offline) |
| 8 | Faible | Très faible | écritures offline bloquées sur données à date nulle |
| 5 / 6 / 7 | Moyen | Moyen | robustesse sync, prévention doublons/pertes |

Findings 1 + 2 + 3 + 8 sont des correctifs localisés (quelques lignes chacun) qui règlent la quasi-totalité de ce que tu as constaté. Findings 4/6/7 demandent une décision d'architecture (delta vs absolu, id de corrélation) mais **aucune réécriture globale**.
