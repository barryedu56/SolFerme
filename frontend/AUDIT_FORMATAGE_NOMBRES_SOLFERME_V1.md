# Audit et Suivi du Formatage des Nombres - SolFerme

## Objectifs
- Implémenter le séparateur de milliers (espace) partout.
- Garder la saisie fluide (valeur brute au focus).
- Garantir des données propres (sans espaces) pour le back-end.

## État des Lieux
- [ ] `src/utils/formatters.ts` : Vérifié et complet.
- [ ] `src/components/Input.tsx` : Gère le formatage au focus/blur.
- [ ] `src/screens/actions/ProductionScreen.tsx` : Nettoyage des données avant envoi.
- [ ] `src/screens/actions/VenteScreen.tsx` : Nettoyage des données avant envoi.
- [ ] `src/screens/actions/AddExpenseScreen.tsx` : Nettoyage des données avant envoi.
- [ ] `src/screens/hr/EmployeesScreen.tsx` : Nettoyage des données avant envoi (Salaires).
- [ ] Dashboard / Listes : Utilisation de `formatCurrency`.

## Modifications effectuées
- `src/components/Input.tsx` : Correction de `handleChangeText` pour rejeter les espaces à la saisie mais autoriser la virgule (convertie en point).
- `src/screens/actions/AddExpenseScreen.tsx` : Nettoyage de l'espace dans `amount` avant `parseFloat`.
- `src/screens/actions/ProductionScreen.tsx` : Nettoyage systématique des espaces pour `casiersProdu`, `casiersVendables` et `oeufssCasses` avant les calculs et l'envoi API.
- `src/screens/actions/VenteScreen.tsx` : Nettoyage systématique des espaces pour `quantity`, `unitPrice` et `amountPaid` pour les calculs de totaux et l'envoi API.
- `src/screens/CreateEmployeeScreen.tsx` : Nettoyage de `salary` avant l'envoi API.
