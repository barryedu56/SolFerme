# SolFerme 🐔

## Présentation du projet

SolFerme est une application mobile de gestion d'élevage de poules pondeuses.

L'objectif est de permettre aux fermiers de gérer facilement :

- leurs fermes
- leurs lots de poules
- la production d'œufs
- les ventes
- les dépenses
- l'alimentation
- la santé des poules
- les employés
- les rappels
- les statistiques


## Architecture du projet

Le projet est composé de deux parties :
Pour que ton binôme puisse accéder à ton projet SolFerme, il faut faire deux choses :

1) Ajouter ton binôme comme collaborateur GitHub

Sur GitHub :

Ouvre ton dépôt :
https://github.com/barryedu56/SolFerme
Va dans :
Settings
↓
Collaborators
↓
Add people
Mets son nom d'utilisateur GitHub ou son email GitHub.
Il accepte l'invitation.

Après ça il pourra récupérer le projet :

git clone https://github.com/barryedu56/SolFerme.git
2) Organisation de travail à deux

Je conseille :

Toi (chef du projet)

Branche :

main

Contient les versions stables.

Ton binôme

Créer sa branche :

git checkout -b develop

Il travaille dessus.

Quand il finit une fonctionnalité :

git add .
git commit -m "Ajout module X"
git push origin develop

Puis vous fusionnez vers main.

Maintenant ton README doit expliquer le projet pour qu'il comprenne rapidement.

Voici un cahier de charge README que tu peux mettre dans README.md :

# SolFerme 🐔

## Présentation du projet

SolFerme est une application mobile de gestion d'élevage de poules pondeuses.

L'objectif est de permettre aux fermiers de gérer facilement :

- leurs fermes
- leurs lots de poules
- la production d'œufs
- les ventes
- les dépenses
- l'alimentation
- la santé des poules
- les employés
- les rappels
- les statistiques


## Architecture du projet

Le projet est composé de deux parties :


SolFerme

├── frontend
│ └── Application mobile React Native
│
└── backend
└── API Django + Base de données



# Technologies utilisées

## Frontend

- React Native
- Expo
- JavaScript / TypeScript
- Navigation mobile


## Backend

- Django
- Django REST Framework
- MySQL


# Installation du projet


## 1. Cloner le projet

git clone https://github.com/barryedu56/SolFerme.git
Backend Django

Entrer dans le backend :

cd backend

Créer l'environnement virtuel :

python -m venv venv

Activer :

Windows :

venv\Scripts\activate

Installer les dépendances :

pip install -r requirements.txt

Configurer la base de données dans :

backend/settings.py

Lancer les migrations :

python manage.py migrate

Créer un administrateur :

python manage.py createsuperuser

Lancer le serveur :

python manage.py runserver

Le backend sera disponible :

http://127.0.0.1:8000
Frontend React Native

Entrer dans :

cd frontend

Installer les dépendances :

npm install

Lancer l'application :

npm start
Logique métier principale
Structure principale

Utilisateur

↓

Ferme

↓

Lot de poules

↓

Actions du lot

Toutes les actions doivent être liées à un lot :

Production
Vente
Alimentation
Santé
Mouvement
Rappel
Gestion des rôles
Propriétaire

Peut :

créer une ferme
gérer les lots
gérer les employés
voir les finances
consulter les statistiques
gérer les paramètres
Employé

Accès limité :

Peut :

voir sa ferme
voir ses lots affectés
enregistrer production
enregistrer alimentation
enregistrer santé
consulter ses tâches

Ne peut pas :

voir les finances globales
supprimer les données importantes
gérer les utilisateurs
Modules disponibles
Authentification
Connexion
Inscription
Mot de passe oublié
Ferme

Gestion :

création
modification
suppression
Lots

Gestion :

création lot
détails
statistiques
Production

Gestion :

œufs normaux
œufs cassés
historique
Vente

Gestion :

vente par casier
œufs normaux
œufs cassés
calcul revenu
Finance

Gestion :

ventes
dépenses
bénéfices
Santé

Gestion :

vaccins
traitements
maladies
Alimentation

Gestion :

quantité consommée
coût alimentation
Employés

Gestion :

employés
affectation
présence
paiement
Rappels

Gestion :

vaccins
traitements
tâches
Règles importantes
Monnaie

Toutes les valeurs financières utilisent :

GNF (Franc Guinéen)
Calcul bénéfice
Bénéfice net = Revenus - Dépenses

Dépenses :

alimentation
santé
salaires
transport
électricité
location
matériel
Données

Toutes les données doivent venir de :

React Native
        ↓
API Django
        ↓
MySQL

Pas de données fictives ou statiques.

Convention Git

Avant de modifier :

git pull

Créer une branche :

git checkout -b nom-fonctionnalite

Après modification :

git add .
git commit -m "Description modification"
git push
Objectif final

Obtenir une application professionnelle permettant à un fermier de gérer entièrement son élevage :

Ferme

↓

Lots

↓

Poules

↓

Production

↓

Ventes

↓

Dépenses

↓

Santé

↓

Employés

↓

Statistiques


Avec ça ton binôme aura le contexte complet avant de toucher au code.
