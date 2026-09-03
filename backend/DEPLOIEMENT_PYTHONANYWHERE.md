# Mise en ligne du backend SolFerme — PythonAnywhere

Héberger l'API Django + MySQL sur PythonAnywhere, pour qu'elle réponde 24 h/24
aux apps Android, iOS et web. À suivre **dans l'ordre**, une phase après l'autre.

---

## Le principe

Tu continues à développer **sur ton PC comme aujourd'hui**. Le serveur ne fait
que tourner la version « production ». À chaque modification :

```
git push  (depuis ton PC)  →  git pull  (sur le serveur)  →  Reload
```

Ce runbook utilise des **noms concrets** pour que les commandes soient copiables
telles quelles.

| Élément | Valeur |
|---|---|
| Compte PythonAnywhere | `ahmad5` — **plan Developer, 10 $/mois** |
| Nom d'utilisateur | `ahmad5` (non modifiable — voir note ci-dessous) |
| Domaine de l'API | `ahmad5.pythonanywhere.com` *(ou `ahmad5.eu.pythonanywhere.com` si compte EU)* |
| Dépôt GitHub (public) | `https://github.com/barryedu56/SolFerme.git` |
| Dépôt cloné dans | `~/SolFerme` |
| Environnement virtuel | `solferme` |
| Base de données | `ahmad5$solferme` |

> **Le nom d'utilisateur `ahmad5` ne peut pas être changé** sur PythonAnywhere.
> Ce n'est pas grave : il n'apparaît que dans l'URL de l'API et les chemins de
> fichiers, jamais dans l'application. Plus tard, un domaine personnalisé
> (`api.solferme.com` → le plan Developer le permet) le masquera complètement.
> Recréer le compte sous `barryedu56` est possible (Account → Delete account puis
> ré-inscription) mais **pas nécessaire**.

> **EU ou US ?** Regarde l'adresse dans ton navigateur : `www.pythonanywhere.com`
> = compte US (domaine `ahmad5.pythonanywhere.com`), `eu.pythonanywhere.com` =
> compte EU (domaine `ahmad5.eu.pythonanywhere.com`). On ne peut pas changer
> après l'inscription. Les deux fonctionnent ; adapte simplement le domaine dans
> toutes les commandes ci-dessous.

> **Quel plan.** Le plan à 5 $ n'existe plus. Prends **Developer, 10 $/mois** :
> facturation mensuelle, annulable à tout moment, remboursé 30 jours. Il couvre
> tout ce dont SolFerme a besoin — **accès Internet sortant sans restriction**
> (notifications push Expo + e-mails), 1 web app, tâches planifiées et
> « always-on », 5 Go de disque, MySQL. Le plan gratuit, lui, bloque le trafic
> sortant : push et e-mails échoueraient en silence.

---

## Avant de commencer — 3 changements de code déjà faits

Le backend a été adapté pour la production. Rien à écrire de ton côté, juste à
**committer et pousser**.

- `backend/solferme_api/settings.py` — WhiteNoise (sert les fichiers statiques de
  l'admin sans serveur web dédié), `STATIC_ROOT`, et chargement du `.env` par
  chemin absolu (fiable quel que soit le contexte : WSGI, cron, always-on).
- `backend/requirements.txt` — ajout de `whitenoise==6.12.0`.
- `backend/scripts/run_reminders_loop.sh` — nouveau : boucle pour la tâche
  « always-on » qui traite les rappels toutes les 10 min.
- `.gitignore` — ignore `backend/staticfiles/` (généré par le serveur).

```bash
# depuis ton PC, dans c:\Projet\SolFerme
git add -A
git commit -m "Prod: WhiteNoise + STATIC_ROOT + tache rappels PythonAnywhere"
git push origin main
```

---

## Phase 01 — Passer au plan Developer

1. Sur la page des plans, clique **Switch Now** sous **Developer — 10 $/month**.
2. Renseigne le moyen de paiement. Facturation mensuelle, résiliable quand tu veux.

✅ **Vérification** : le tableau de bord (onglet **Dashboard**) affiche
« Developer plan ». Les onglets **Databases** et **Tasks** sont accessibles.

---

## Phase 02 — Récupérer le code

Onglet **Consoles** → **Bash** (ouvre un terminal dans le navigateur).

```bash
cd ~
git clone https://github.com/barryedu56/SolFerme.git
ls SolFerme/backend
```

*(Le dépôt est public : aucun mot de passe demandé.)*

✅ **Vérification** : `ls` liste bien `manage.py`, `requirements.txt`, `solferme_api/`.

---

## Phase 03 — Environnement virtuel + dépendances

```bash
mkvirtualenv --python=/usr/bin/python3.13 solferme
# si 3.13 indisponible : essaie python3.12, puis python3.11
pip install -r ~/SolFerme/backend/requirements.txt
```

Le prompt devient `(solferme) $`. Pour y revenir plus tard : `workon solferme`.

✅ **Vérification** : `pip show django` affiche `Version: 6.0.6`. Aucune erreur
rouge à l'installation.

---

## Phase 04 — Créer la base MySQL

1. Onglet **Databases** → onglet **MySQL**.
2. Définis un **mot de passe MySQL** (note-le, il servira dans le `.env`).
3. Champ « Create a database » : saisis `solferme` → valide. PythonAnywhere la
   nomme `ahmad5$solferme`.
4. Relève l'adresse du serveur affichée :
   `ahmad5.mysql.pythonanywhere-services.com`
   *(ou `ahmad5.mysql.eu.pythonanywhere-services.com` si compte EU — l'écran
   te donne l'adresse exacte).*

> ⚠️ **Piège** : le nom réel de la base contient le `$` : c'est
> `ahmad5$solferme`, **pas** `solferme`. À reporter exactement dans `DB_NAME`.

---

## Phase 05 — Le fichier `.env` de production

Dans la console Bash, génère d'abord une clé secrète :

```bash
python -c "from django.core.management.utils import get_random_secret_key as k; print(k())"
```

Puis crée le fichier (onglet **Files** →
`/home/ahmad5/SolFerme/backend/` → « New file » nommé `.env`) :

```ini
DJANGO_DEBUG=False
DJANGO_SECRET_KEY=colle_ici_la_cle_generee
DJANGO_ALLOWED_HOSTS=ahmad5.pythonanywhere.com
DJANGO_SECURE_SSL_REDIRECT=True

DB_NAME=ahmad5$solferme
DB_USER=ahmad5
DB_PASSWORD=ton_mot_de_passe_mysql
DB_HOST=ahmad5.mysql.pythonanywhere-services.com
DB_PORT=3306

CORS_ALLOW_ALL_ORIGINS=False
CORS_ALLOWED_ORIGINS=https://ahmad5.pythonanywhere.com

# E-mails — voir phase 08 (laisser vide pour l'instant = mode console)
# EMAIL_HOST=smtp-relay.brevo.com
# EMAIL_PORT=587
# EMAIL_HOST_USER=
# EMAIL_HOST_PASSWORD=
# DEFAULT_FROM_EMAIL=SolFerme <no-reply@solferme.com>
# CONTACT_INBOX=barryedu56@gmail.com
```

*(Compte EU : remplace `ahmad5.pythonanywhere.com` par
`ahmad5.eu.pythonanywhere.com` et l'hôte MySQL par celui affiché à la phase 04.)*

> ⚠️ **Piège** : `.env` est dans le `.gitignore` : il ne se télécharge **pas**
> avec `git clone`, il faut le créer à la main sur le serveur. Et il ne doit
> jamais être commité.

---

## Phase 06 — Configurer l'app Web

1. Onglet **Web** → **Add a new web app** → accepte le domaine
   `ahmad5.pythonanywhere.com` → **Manual configuration** → **Python 3.13**
   (la même version qu'en phase 03).
2. Section **Code** :
   - Source code : `/home/ahmad5/SolFerme/backend`
   - Working directory : `/home/ahmad5/SolFerme/backend`
3. Section **Virtualenv** : saisis `solferme` (PythonAnywhere complète le chemin).
4. Section **Code** → clique le lien **WSGI configuration file** et remplace
   tout son contenu par :

```python
import os, sys

path = "/home/ahmad5/SolFerme/backend"
if path not in sys.path:
    sys.path.insert(0, path)

os.environ["DJANGO_SETTINGS_MODULE"] = "solferme_api.settings"

from django.core.wsgi import get_wsgi_application
application = get_wsgi_application()
```

5. Section **Static files** → ajoute une ligne : URL `/media/` → Directory
   `/home/ahmad5/SolFerme/backend/media`.
   *(Le `/static/` est géré automatiquement par WhiteNoise, rien à mapper.)*
6. Section **Security** → active **Force HTTPS**.
7. Ne recharge pas encore — on fait les migrations d'abord (phase 07).

---

## Phase 07 — Migrations, compte admin, fichiers statiques

Console Bash :

```bash
workon solferme
cd ~/SolFerme/backend
python manage.py migrate
python manage.py createsuperuser
python manage.py collectstatic --noinput
```

1. Retourne dans l'onglet **Web** → gros bouton vert **Reload**.
2. Ouvre `https://ahmad5.pythonanywhere.com/admin/`.

✅ **Vérification** :
- La page de connexion admin s'affiche **avec sa mise en forme** (fond bleu,
  champs stylés) — preuve que WhiteNoise sert les statiques. Connexion possible
  avec le compte créé.
- `https://ahmad5.pythonanywhere.com/api/` répond du JSON (pas une erreur
  400/500).

> ⚠️ **Pièges** :
> - **400 Bad Request** sur toutes les pages : `DJANGO_ALLOWED_HOSTS` vide ou mal
>   orthographié dans le `.env`. Corrige, puis **Reload**.
> - Admin **sans CSS** : `collectstatic` n'a pas tourné, ou l'app n'a pas été
>   rechargée après.

---

## Phase 08 — Tâche des rappels + e-mails

### Rappels (notifications push + marquage « en retard »)

Onglet **Tasks**. Choisis l'option la plus simple :

- **Scheduled task, cadence horaire** (recommandé pour démarrer) — dans
  « Scheduled tasks », coche **Hourly**, minute `5`, commande :

  ```
  /home/ahmad5/.virtualenvs/solferme/bin/python /home/ahmad5/SolFerme/backend/manage.py process_reminders
  ```

- **Always-on task** (optionnel, cadence 10 min, si ton plan l'autorise) —
  dans « Always-on tasks », commande :

  ```
  bash /home/ahmad5/SolFerme/backend/scripts/run_reminders_loop.sh
  ```

*(Les rappels ont une date + une heure. En horaire, un rappel de 08:00 est
notifié entre 08:00 et 09:00 — largement acceptable pour une ferme.)*

✅ **Vérification** : le log de la tâche (lien « Log » dans l'onglet Tasks)
affiche des lignes du type `0 rappel(s) notifié(s) par push.` sans traceback.

### E-mails (réinitialisation de mot de passe, formulaire de contact)

1. Crée un compte [Brevo](https://www.brevo.com) (gratuit, 300 e-mails/jour) →
   section **SMTP & API** → relève l'hôte, le login et la clé SMTP.
2. Dé-commente et remplis le bloc e-mail du `.env` (phase 05).
3. Onglet **Web** → **Reload**.

> Sans SMTP configuré, l'app fonctionne : les e-mails sont juste écrits dans les
> logs au lieu d'être envoyés. La réinitialisation de mot de passe par e-mail ne
> marchera pas tant que le SMTP n'est pas en place.

---

## Phase 09 — Brancher le frontend sur l'API en ligne

Le câblage existe déjà dans le code (`app.config.js` → `client.ts`). Il suffit de
fournir l'URL.

### Pour les builds mobiles (EAS) — plus tard

Dans `frontend/eas.json`, ajoute un bloc `env` aux profils `preview` et
`production` :

```json
"production": {
  "env": {
    "EXPO_PUBLIC_API_URL": "https://ahmad5.pythonanywhere.com/api",
    "EXPO_PUBLIC_EAS_PROJECT_ID": "rempli_par_eas_init"
  },
  "android": { "buildType": "app-bundle" },
  "ios": { "resourceClass": "m-medium" }
}
```

### Pour tester depuis le web tout de suite

Crée `frontend/.env` (déjà gitignoré) :

```ini
EXPO_PUBLIC_API_URL=https://ahmad5.pythonanywhere.com/api
```

Ou, sans rebuild : dans l'app, écran **Gestion base de données** → change l'URL
de l'API (fonction `configureApiUrl`).

✅ **Vérification** : connexion depuis l'app avec un compte réel → les données se
chargent depuis le serveur. Coupe le wifi → l'app bascule sur la base locale
(mode offline).

---

## Mettre à jour l'app plus tard

À chaque fois que tu pousses du nouveau code depuis ton PC :

```bash
workon solferme
cd ~/SolFerme && git pull
pip install -r backend/requirements.txt   # si requirements.txt a changé
cd backend
python manage.py migrate                  # si nouvelles migrations
python manage.py collectstatic --noinput  # si CSS/JS admin a changé
# puis onglet Web → Reload
```

---

## Checklist finale

- [ ] Code committé et poussé sur GitHub (`main`)
- [ ] Plan Developer actif
- [ ] `.env` présent sur le serveur, `DEBUG=False`, `ALLOWED_HOSTS` = le domaine exact
- [ ] `python manage.py migrate` passé sans erreur
- [ ] Compte superuser créé, `/admin/` accessible et stylé
- [ ] `/api/` répond du JSON en HTTPS
- [ ] Force HTTPS activé, mapping `/media/` ajouté
- [ ] Tâche des rappels en place (horaire ou always-on), log propre
- [ ] Frontend pointé sur la nouvelle URL, synchro testée sur un appareil

---

## Pièges fréquents

| Symptôme | Cause / correctif |
|---|---|
| 400 Bad Request partout | `DJANGO_ALLOWED_HOSTS` vide ou faux. Doit valoir exactement ton domaine (`ahmad5.pythonanywhere.com` ou la variante EU). |
| « Access denied » MySQL | `DB_NAME` doit inclure le préfixe `ahmad5$solferme`. `DB_HOST` = l'adresse `…mysql.pythonanywhere-services.com` affichée, pas `localhost`. |
| Le `.env` n'est pas lu | Vérifie l'emplacement : `/home/ahmad5/SolFerme/backend/.env`. Le code le charge par chemin absolu. |
| Push / e-mails silencieux | Presque toujours : encore sur le plan gratuit. Un plan payant débloque le trafic sortant. |
| Admin sans style | `collectstatic` non exécuté, ou app non rechargée ensuite. Relance les deux. |
| Rappels à la mauvaise heure | `TIME_ZONE = 'UTC'` dans `settings.py`. Pour l'Afrique de l'Ouest (méridien de Greenwich), UTC = heure locale : rien à changer. Ailleurs, ajuste `TIME_ZONE`. |

---

*Les phases 01–08 couvrent l'hébergement ; la publication Play Store / App Store
est une étape ultérieure (EAS Build).*
