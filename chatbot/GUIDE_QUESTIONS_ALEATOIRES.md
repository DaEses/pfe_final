# Guide — Questions d'entretien aléatoires (module chatbot)

Ce document sert à **assister à distance** un autre développeur qui clone le projet sur un autre PC et doit activer ou modifier le tirage aléatoire des questions (sans répéter les mêmes questions à chaque candidat / entretien).

**Dépôt** : https://github.com/DaEses/pfe_final

---

## 1. Comportement attendu

| Règle | Détail |
|--------|--------|
| Banque centralisée | Toutes les questions sont dans `chatbot/interview_questions.json` |
| Tirage aléatoire | À chaque **Start Interview**, 6 questions tirées au hasard (configurable) |
| Pas de doublon dans un entretien | Jamais deux fois la même question sur une session |
| Intro en premier | Une question « introduction » est placée en première position |
| Pas de répétition entre entretiens | Les questions déjà posées au **même email candidat** (rapports précédents) sont exclues |

---

## 2. Fichiers du module

| Fichier | Rôle |
|---------|------|
| `chatbot/interview_questions.json` | Banque de questions (`id`, `category`, `template` avec `{job_role}`) |
| `chatbot/question_picker.py` | Logique Python : tirage aléatoire, exclusions |
| `chatbot/pick_questions_cli.py` | CLI appelée par le backend NestJS |
| `chatbot/api_runner.py` | Entretien vocal HR (Whisper) — utilise aussi `question_picker` |
| `job-finder-backend/.../interview.service.ts` | Appelle le CLI au `begin` candidat |

---

## 3. Installation sur un autre PC (rappel minimal)

```powershell
git clone https://github.com/DaEses/pfe_final.git
cd pfe_final

# Python chatbot (obligatoire pour le picker)
cd chatbot
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
deactivate
cd ..

# Backend + frontend — voir README_FINAL.md (PostgreSQL, .env, npm)
```

Vérifier que ces fichiers existent après clone :

- `chatbot/interview_questions.json`
- `chatbot/question_picker.py`
- `chatbot/pick_questions_cli.py`

---

## 4. Tester le picker en local (sans lancer toute l'app)

```powershell
cd chatbot
.\.venv\Scripts\python.exe -c "from question_picker import pick_interview_questions; import json; print(json.dumps(pick_interview_questions('Frontend Developer'), indent=2, ensure_ascii=False))"
```

Relancer la commande **plusieurs fois** : les questions doivent **changer** (sauf hasard rare).

Test CLI (comme le backend) :

```powershell
.\.venv\Scripts\python.exe pick_questions_cli.py --job-role "Data Scientist"
```

---

## 5. Tester via l'API (backend démarré)

1. PostgreSQL + backend (`DB_PORT` correct dans `.env`) + frontend.
2. RH : approuver un candidat + planifier l'entretien.
3. Candidat : **Start Interview** → noter les questions affichées.
4. Terminer ou abandonner, puis **nouvel entretien** (autre offre ou reset statut HR) : les questions doivent être **différentes**.
5. Même candidat, **deuxième entretien** : les questions de la première session ne doivent **pas** réapparaître (exclusion via rapports en base).

Endpoint concerné :

```http
POST /api/interviews/candidate/begin
Authorization: Bearer <token candidat>
Body: { "jobPostingId": "<uuid>" }
```

Réponse :

```json
{
  "interviewId": "...",
  "questions": ["...", "..."],
  "questionIds": ["intro_1", "tech_2", ...]
}
```

---

## 6. Ajouter ou modifier des questions

Éditer **`chatbot/interview_questions.json`** :

```json
{
  "id": "custom_1",
  "category": "technical",
  "template": "How would you design an API for {job_role}?"
}
```

| Champ | Description |
|-------|-------------|
| `id` | Identifiant unique (ne pas dupliquer) |
| `category` | `introduction`, `experience`, `technical`, `behavioral`, etc. |
| `template` | Texte affiché ; utiliser `{job_role}` pour le titre du poste |

Modifier le nombre de questions par entretien :

```json
"defaultCount": 6
```

Après modification :

1. Sauvegarder le JSON.
2. Redémarrer le backend (`npm run start:dev`).
3. Pas besoin de rebuild le frontend.

---

## 7. Code modifié (résumé pour revue)

### `chatbot/question_picker.py` (nouveau)

- `pick_interview_questions(job_role, count, exclude_ids, exclude_texts)`
- `random.sample` / shuffle sans remettre deux fois le même `id` dans une session.

### `chatbot/api_runner.py`

```python
from question_picker import pick_question_strings
# ...
questions = pick_question_strings(job_role, exclude_texts=exclude_texts)
```

### `interview.service.ts` (backend)

- `getPreviouslyUsedQuestionTexts(applicantEmail)` — lit les rapports passés.
- `pickInterviewQuestionsFromBank()` — exécute `pick_questions_cli.py`.
- `beginCandidateSession()` — enregistre `questions.json` dans la session émotion + renvoie `questions` / `questionIds`.

---

## 8. Dépannage à distance

| Problème | Cause probable | Action |
|----------|----------------|--------|
| Toujours les 5 mêmes questions fixes | Backend pas redémarré ou ancien code | `git pull`, redémarrer backend, vérifier présence de `pick_questions_cli.py` |
| Erreur silencieuse → questions fallback | Python / venv chatbot manquant | Créer `chatbot/.venv` + `pip install -r requirements.txt` |
| `pick_questions_cli.py` introuvable | Mauvais `getProjectRoot()` ou mauvais dossier | Lancer backend depuis repo cloné complet |
| JSON invalide | Virgule en trop dans `interview_questions.json` | Valider sur https://jsonlint.com |
| Même questions pour le même candidat | Normal si banque petite et beaucoup d'entretiens | Ajouter des entrées dans le JSON (viser 25+ questions) |

Logs backend à surveiller :

```text
Question picker failed, using inline fallback
```

---

## 9. Pousser les changements sur GitHub

Sur la machine de développement :

```powershell
cd pfe_final
git add chatbot/interview_questions.json chatbot/question_picker.py chatbot/pick_questions_cli.py chatbot/api_runner.py chatbot/GUIDE_QUESTIONS_ALEATOIRES.md
git add plateform/jobfinderportal-master/job-finder-backend/src/modules/interview/interview.service.ts
git commit -m "feat: questions entretien aleatoires depuis banque JSON"
git push origin main
```

Sur l'autre PC :

```powershell
git pull origin main
# Redémarrer backend
```

---

## 10. Checklist assistance à distance

1. `git pull` à jour ?
2. `chatbot/.venv` + `pip install -r requirements.txt` ?
3. Test `pick_questions_cli.py` (section 4) OK ?
4. `DB_PORT` + backend démarré ?
5. Parcours candidat **begin** → questions différentes à chaque essai ?
6. Besoin de plus de variété → enrichir `interview_questions.json`
