# RAPPORT D'ANALYSE : FLUX STOCK ALIMENTATION

## 1. FLUX TESTÉ (PHASE 7)
1. **Achat Matière Première** : Maïs +100 kg.
2. **Préparation Mélange** : Création de 50 kg de "Mélange Alpha" en utilisant 40 kg de Maïs.
3. **Distribution** : Distribution de 10 kg de "Mélange Alpha".

## 2. VALEURS ATTENDUES VS OBTENUES
| Étape | Matière Première (Maïs) | Mélange Préparé | Observations |
| :--- | :--- | :--- | :--- |
| **Initial** | 0 kg | 0 kg | |
| **Après Achat** | 100 kg | 0 kg | OK |
| **Après Préparation** | **Attendu: 60 kg** / Obtenu: 20 kg | **Attendu: 50 kg** / Obtenu: 100 kg | **Double déduction (Maïs) / Double ajout (Mélange)** |
| **Après Distribution** | 60 kg | **Attendu: 40 kg** / Obtenu: 30 kg | **Double déduction du mélange** |

## 3. CAUSE DU PROBLÈME : DOUBLE GESTION DES STOCKS
Le système utilise actuellement deux mécanismes contradictoires :
1. **Django Signals (`signals.py`)** : Recalcule le stock total à partir de zéro ("Source de Vérité") à chaque enregistrement. C'est la méthode robuste choisie.
2. **Serializers (`serializers.py`)** : Effectuent des opérations manuelles de type `+=` ou `-=` après la création de l'objet.

**Scénario de la double déduction (Distribution) :**
1. L'appel à `Feed.objects.create(10kg)` déclenche le signal `post_save`.
2. Le signal recalcule : `Production(50kg) - Distribution(10kg) = 40kg`. Le stock est mis à jour à **40kg**.
3. Le code du Serializer reprend et soustrait manuellement : `Stock Actuel(40kg) - 10kg = 30kg`.
4. Résultat final : **30kg** au lieu de 40kg.

## 4. ACTIONS DE CORRECTION
- Supprimer toutes les manipulations manuelles de `FeedInventory`, `PreparedFeedInventory` et `HealthInventory` dans `serializers.py`.
- Se reposer exclusivement sur les signaux définis dans `signals.py` qui garantissent l'intégrité des stocks en recalculant les sommes totales.
- Vérifier que les méthodes `update` des Serializers ne perturbent pas non plus ce flux.
