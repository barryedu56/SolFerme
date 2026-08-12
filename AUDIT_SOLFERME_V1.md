# Rapport d'Audit SolFerme V1

Date de l'audit : 28/06/2026

## Synthèse des Tests Fonctionnels

| Module | Statut | Détails |
| --- | --- | --- |
| Login Owner | ✅ | Successfully logged in and received JWT. |
| Create Farm Alpha | ✅ | Farm Alpha created with ID 10 |
| Create Employee Ahmad (User) | ❌ | {"email":["user with this email already exists."],"phone":["user with this phone already exists."]} |
| Create Lot A in Farm Alpha | ✅ | Lot created with ID 7 |
| Feed Purchase | ✅ | Successfully purchased 100kg feed. |
| Feed Consumption | ❌ | CRITICAL BUG: 'Feed' object has no attribute 'farm' (AttributeError in FeedViewSet.perform_create - tries to access instance.farm instead of instance.lot.farm) |
| Stock Verification | ✅ | Inventory details: [{'id': 7, 'feed_type': 'Démarrage', 'quantity_kg': '200.00', 'updated_at': '2026-06-28T13:17:42.643461Z', 'lot': 7}] |
| Production Entry | ✅ | Successfully recorded 10 casiers. |
| Sale Entry | ✅ | Successfully sold 5 casiers. |
| Mortality Entry | ❌ | CRITICAL BUG: 'ChickenMovement' object has no attribute 'farm' (AttributeError in ChickenMovementViewSet.perform_create - tries to access instance.farm instead of instance.lot.farm) |
| Stats Verification | ✅ | Statistics loaded successfully. |

## Bugs Critiques Identifiés (Sévérité Haute)

1. **Coupure du flux d'Alimentation** : `FeedViewSet.perform_create` tente d'accéder à `instance.farm`, ce qui provoque une erreur 500 car le modèle `Feed` n'a pas ce champ (il faut passer par `instance.lot.farm`).
2. **Coupure du flux des Mouvements (Santé)** : `ChickenMovementViewSet.perform_create` présente le même défaut structurel, empêchant l'enregistrement des mortalités ou maladies.
3. **Régression de validation d'utilisateur** : Le validateur de mot de passe est extrêmement strict mais n'était pas documenté dans les spécifications initiales, ce qui a causé l'échec initial de création d'employé.
