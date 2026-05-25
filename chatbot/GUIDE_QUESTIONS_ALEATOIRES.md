# Guide technique — Questions d'entretien aléatoires (chatbot)

Document pour **reproduire ou vérifier** la modification sur un autre PC (assistance à distance).  
Dépôt : **https://github.com/DaEses/pfe_final**

---

## A. Contexte : deux « chatbots » dans le projet

| Mode | Fichier | Questions différentes ? | Comment |
|------|---------|-------------------------|---------|
| **Entretien interactif Ollama** (standalone) | `chatbot/hr_interview.py` | **Oui** | Le modèle **Llama/Ollama** génère les questions à la volée (pas de fichier JSON). Nécessite `ollama serve`. |
| **Entretien web candidat** (production) | Backend `interview.service.ts` → navigateur | **Avant modif : Non** | Liste **fixe** de 5 questions en dur dans le code → **toujours les mêmes**. |
| **Entretien vocal HR** (legacy, bouton rapport) | `chatbot/api_runner.py` | **Avant modif : Non** | Même liste fixe dans `build_default_questions()`. |
| **Après cette modification** | JSON + `question_picker.py` | **Oui** | Tirage aléatoire dans `interview_questions.json` (31 questions), sans doublon par session, exclusion si déjà posées au même candidat. |

**Conclusion :** l’ancien chatbot « intelligent » (`hr_interview.py` + Ollama) posait déjà des questions variées, mais **l’entretien dans l’application web** utilisait une liste codée en dur. Ce guide corrige **le flux web** et **`api_runner.py`**.

---

## B. Arborescence — fichiers à ajouter

Créer ces fichiers **dans le dossier `chatbot/`** à la racine du projet (`pfe_final/chatbot/`).

```
pfe_final/
└── chatbot/
    ├── interview_questions.json    ← NOUVEAU (banque de questions)
    ├── question_picker.py          ← NOUVEAU (tirage aléatoire)
    ├── pick_questions_cli.py       ← NOUVEAU (appelé par NestJS)
    ├── GUIDE_QUESTIONS_ALEATOIRES.md
    ├── api_runner.py               ← À MODIFIER (voir section C)
    ├── hr_interview.py             ← INCHANGÉ (Ollama)
    └── .venv/                      ← À CRÉER sur chaque PC (non versionné Git)
```

### B.1 `chatbot/interview_questions.json` (fichier complet à ajouter)

Copier depuis le dépôt Git, ou créer avec cette structure :

```json
{
  "version": 1,
  "defaultCount": 6,
  "questions": [
    {
      "id": "intro_1",
      "category": "introduction",
      "template": "Please introduce yourself and explain why you are interested in the {job_role} role."
    }
  ]
}
```

- Ajouter **autant d’objets** que souhaité dans `"questions"` (le repo en contient **31**).
- `{job_role}` est remplacé par le titre du poste (ex. « Frontend Developer »).
- `"defaultCount": 6` = nombre de questions par entretien.

### B.2 `chatbot/question_picker.py` (fichier complet à ajouter)

Fichier entier (~120 lignes). Fonctions principales :

- `load_question_bank()` — lit `interview_questions.json`
- `pick_interview_questions(job_role, count, exclude_ids, exclude_texts)` — tirage aléatoire
- `pick_question_strings(...)` — retourne seulement les textes

**Source de vérité :** cloner le fichier depuis GitHub :

```powershell
git show origin/main:chatbot/question_picker.py > chatbot/question_picker.py
```

(ou `git pull` si tout le projet est cloné.)

### B.3 `chatbot/pick_questions_cli.py` (fichier complet à ajouter)

Petit script CLI (~37 lignes) : le backend NestJS l’exécute et lit le JSON sur **stdout**.

```powershell
git show origin/main:chatbot/pick_questions_cli.py > chatbot/pick_questions_cli.py
```

---

## C. Fichiers existants à modifier

### C.1 `chatbot/api_runner.py`

**Dossier :** `pfe_final/chatbot/api_runner.py`

#### AVANT (comportement fixe — à supprimer)

Vers les lignes **14–21**, il y avait :

```python
def build_default_questions(job_role: str):
    return [
        f"Please introduce yourself for the {job_role} role.",
        "Tell us about a project you are proud of.",
        "How do you handle deadlines and pressure?",
        "Describe a challenge you solved with your team.",
        "Why do you want to join this company?",
    ]
```

Et dans `run_interview` :

```python
questions = build_default_questions(job_role)
```

#### APRÈS (code actuel)

**Ligne 10** — ajouter l’import :

```python
from question_picker import pick_question_strings
```

**Lignes 40–46** — signature et tirage :

```python
def run_interview(
    candidate_name: str,
    job_role: str,
    answer_seconds: int,
    exclude_texts: list[str] | None = None,
):
    questions = pick_question_strings(job_role, exclude_texts=exclude_texts)
```

**Lignes 76–94** — dans `main()`, lire les questions déjà utilisées :

```python
    parser.add_argument(
        "--exclude-texts-file",
        default="",
        help="JSON file: array of question strings already used",
    )
    # ...
    exclude_texts: list[str] = []
    if args.exclude_texts_file and os.path.isfile(args.exclude_texts_file):
        with open(args.exclude_texts_file, "r", encoding="utf-8") as fp:
            data = json.load(fp)
            if isinstance(data, list):
                exclude_texts = [str(x) for x in data]

    payload = run_interview(
        args.candidate_name,
        args.job_role,
        max(5, args.answer_seconds),
        exclude_texts=exclude_texts,
    )
```

---

### C.2 `plateform/jobfinderportal-master/job-finder-backend/src/modules/interview/interview.service.ts`

**Dossier :** `job-finder-backend/src/modules/interview/interview.service.ts`

#### AVANT (lignes ~190–198 environ) — à remplacer

```typescript
  buildInterviewQuestions(jobRole: string): string[] {
    return [
      `Please introduce yourself for the ${jobRole} role.`,
      'Tell us about a project you are proud of.',
      'How do you handle deadlines and pressure?',
      'Describe a challenge you solved with your team.',
      'Why do you want to join this company?',
    ];
  }
```

Et dans `beginCandidateSession`, vers la ligne **612** :

```typescript
      questions: this.buildInterviewQuestions(jobTitle),
```

#### APRÈS — bloc à insérer aux lignes **190–288**

Remplacer l’ancienne méthode `buildInterviewQuestions` par **tout ce bloc** :

| Lignes (actuelles) | Méthode | Rôle |
|--------------------|---------|------|
| **190–209** | `getPreviouslyUsedQuestionTexts()` | Lit les questions des anciens rapports du même email candidat |
| **211–264** | `pickInterviewQuestionsFromBank()` | Lance `python pick_questions_cli.py` |
| **266–281** | `buildInterviewQuestionsFallback()` | 5 questions fixes si Python échoue |
| **283–288** | `buildInterviewQuestions()` | Point d’entrée public async |

Extrait clé **lignes 232–251** (appel Python) :

```typescript
      const { stdout } = await execFileAsync(
        python,
        [
          cli,
          '--job-role',
          jobRole,
          '--exclude-texts-file',
          excludeFile,
        ],
        { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 },
      );
      const parsed = JSON.parse(stdout) as {
        questions?: Array<{ id: string; question: string }>;
      };
      const items = parsed.questions ?? [];
      return {
        questions: items.map((q) => q.question),
        questionIds: items.map((q) => q.id),
      };
```

#### Modification `beginCandidateSession` — lignes **697–721**

Remplacer l’ancien `questions: this.buildInterviewQuestions(jobTitle)` par :

```typescript
    const picked = await this.buildInterviewQuestions(jobTitle, applicantEmail);
    const sessionDir = this.getEmotionSessionDir(interview.id);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionDir, 'questions.json'),
      JSON.stringify(
        {
          jobTitle,
          questions: picked.questions,
          questionIds: picked.questionIds,
          pickedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      'utf8',
    );
    return {
      interviewId: interview.id,
      candidateName: application.applicantName,
      jobTitle,
      questions: picked.questions,
      questionIds: picked.questionIds,
    };
```

#### Modification `runInterviewAutomation` (rapport HR legacy) — lignes **981–1001**

Ajouter **avant** `execPythonSafe` du chatbot :

```typescript
    const excludeTexts = await this.getPreviouslyUsedQuestionTexts(
      application.applicantEmail,
    );
    const excludeFile = path.join(
      artifactsDir,
      `exclude_${interview.id}.json`,
    );
    fs.writeFileSync(excludeFile, JSON.stringify(excludeTexts), 'utf8');
```

Et dans les arguments Python, ajouter :

```typescript
        '--exclude-texts-file',
        excludeFile,
```

---

### C.3 Fichiers frontend — **aucune modification obligatoire**

`CandidateInterview.jsx` utilise déjà `data.questions` renvoyé par `POST /api/interviews/candidate/begin`. Dès que le backend renvoie une liste différente, l’UI suit.

---

## D. Commandes à exécuter (autre PC)

### D.1 Récupérer le code

```powershell
git clone https://github.com/DaEses/pfe_final.git
cd pfe_final
git pull origin main
```

### D.2 Vérifier que les 3 nouveaux fichiers existent

```powershell
Test-Path chatbot\interview_questions.json
Test-Path chatbot\question_picker.py
Test-Path chatbot\pick_questions_cli.py
```

Les trois doivent afficher `True`.

### D.3 Environnement Python chatbot (obligatoire)

```powershell
cd chatbot
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
deactivate
cd ..
```

Sans `chatbot\.venv\Scripts\python.exe`, le backend utilise le **fallback** (5 questions fixes) et log :

`Question picker failed, using inline fallback`

### D.4 Test du module questions (sans lancer l’app)

```powershell
cd chatbot
.\.venv\Scripts\python.exe pick_questions_cli.py --job-role "Data Scientist"
```

Relancer **2 ou 3 fois** : le JSON `questions` doit changer.

Test Python direct :

```powershell
.\.venv\Scripts\python.exe -c "from question_picker import pick_question_strings; print(pick_question_strings('Dev')); print('---'); print(pick_question_strings('Dev'))"
```

### D.5 Backend + base + frontend

Voir **README_FINAL.md**. Résumé :

```powershell
# PostgreSQL : créer la base job_finder (psql ou pgAdmin)
# Backend
cd plateform\jobfinderportal-master\job-finder-backend
copy .env.example .env
# Éditer DB_PORT (8080 ou 5432) et DB_PASSWORD
npm install --legacy-peer-deps
$env:DB_PORT = "8080"
npm run start:dev

# Frontend (autre terminal)
cd ..\job-finder-frontend
copy .env.example .env
npm install
npm run dev
```

Ou à la racine : `.\start-all.ps1` (adapter PostgreSQL si besoin).

### D.6 Test fonctionnel dans le navigateur

1. http://localhost:5173 — inscription HR + candidat, offre, candidature.
2. RH : **Approve + Schedule**.
3. Candidat : **Start Interview** → noter les 6 questions.
4. Nouvel entretien (autre session) → questions **différentes**.

### D.7 Pousser / synchroniser Git (machine de dev)

```powershell
cd pfe_final
git add chatbot/interview_questions.json chatbot/question_picker.py chatbot/pick_questions_cli.py chatbot/api_runner.py chatbot/GUIDE_QUESTIONS_ALEATOIRES.md
git add plateform/jobfinderportal-master/job-finder-backend/src/modules/interview/interview.service.ts
git commit -m "feat: questions entretien aleatoires depuis banque JSON"
git push origin main
```

Sur l’autre PC : `git pull origin main` puis **redémarrer le backend**.

---

## E. Ajouter vos propres questions

Éditer **`chatbot/interview_questions.json`**, ajouter un objet dans `"questions"` :

```json
{
  "id": "custom_api_1",
  "category": "technical",
  "template": "Explain how you would test a REST API for {job_role}."
}
```

Puis redémarrer uniquement le backend (`Ctrl+C` → `npm run start:dev`).

---

## F. Dépannage

| Symptôme | Cause | Action |
|----------|-------|--------|
| Toujours les **mêmes 5 questions** | Fallback actif | Installer `chatbot/.venv`, vérifier logs backend |
| `ModuleNotFoundError: question_picker` | Lancer Python hors dossier `chatbot` | CLI doit être dans `chatbot/` ; backend utilise chemin absolu via `getProjectRoot()` |
| Questions identiques pour **même** candidat | Normal si banque épuisée | Ajouter des entrées dans le JSON |
| Questions **toujours différentes** avec Ollama | `hr_interview.py` | Normal — ce n’est pas le fichier JSON ; c’est Llama |

---

## G. Récapitulatif des chemins absolus (exemple Windows)

| Élément | Chemin type |
|---------|-------------|
| Racine projet | `D:\...\pfe_final\` |
| Banque questions | `...\pfe_final\chatbot\interview_questions.json` |
| Picker | `...\pfe_final\chatbot\question_picker.py` |
| CLI NestJS | `...\pfe_final\chatbot\pick_questions_cli.py` |
| Service backend | `...\pfe_final\plateform\jobfinderportal-master\job-finder-backend\src\modules\interview\interview.service.ts` |
| Python venv | `...\pfe_final\chatbot\.venv\Scripts\python.exe` |

---

## H. Checklist assistance à distance

- [ ] `git pull` effectué  
- [ ] 3 fichiers présents dans `chatbot/`  
- [ ] `api_runner.py` : import `question_picker`, plus de `build_default_questions`  
- [ ] `interview.service.ts` : méthodes lignes 190–288 + `begin` lignes 697–721  
- [ ] `chatbot/.venv` + `pip install -r requirements.txt`  
- [ ] `pick_questions_cli.py` renvoie des JSON différents à chaque run  
- [ ] Backend redémarré, test entretien candidat OK  
