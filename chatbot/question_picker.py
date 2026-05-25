"""
Sélection aléatoire de questions d'entretien depuis interview_questions.json.
Évite les doublons dans une session et peut exclure des questions déjà posées.
"""
from __future__ import annotations

import json
import os
import random
from typing import Iterable

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BANK_PATH = os.path.join(SCRIPT_DIR, "interview_questions.json")


def load_question_bank(path: str | None = None) -> dict:
    bank_path = path or BANK_PATH
    with open(bank_path, "r", encoding="utf-8") as fp:
        return json.load(fp)


def format_question(template: str, job_role: str) -> str:
    role = (job_role or "this position").strip()
    return template.replace("{job_role}", role)


def pick_interview_questions(
    job_role: str,
    count: int | None = None,
    *,
    exclude_ids: Iterable[str] | None = None,
    exclude_texts: Iterable[str] | None = None,
    bank_path: str | None = None,
    seed: int | None = None,
) -> list[dict]:
    """
    Retourne une liste de { id, question } sans doublon d'id dans la session.
    Toujours une question d'introduction si disponible, puis tirage aléatoire.
    """
    bank = load_question_bank(bank_path)
    pool = list(bank.get("questions") or [])
    if not pool:
        return [
            {
                "id": "fallback_1",
                "question": format_question(
                    "Please introduce yourself for the {job_role} role.",
                    job_role,
                ),
            }
        ]

    target = count if count is not None else int(bank.get("defaultCount", 6))
    target = max(1, min(target, len(pool)))

    excluded_ids = {str(x) for x in (exclude_ids or [])}
    excluded_texts = {str(x).strip().lower() for x in (exclude_texts or []) if str(x).strip()}

    available = []
    for item in pool:
        qid = str(item.get("id", ""))
        if qid in excluded_ids:
            continue
        text = format_question(str(item.get("template", "")), job_role)
        if text.strip().lower() in excluded_texts:
            continue
        available.append({**item, "_formatted": text})

    if not available:
        available = [
            {**item, "_formatted": format_question(str(item.get("template", "")), job_role)}
            for item in pool
        ]

    rng = random.Random(seed)

    intro = [q for q in available if q.get("category") == "introduction"]
    rest = [q for q in available if q.get("category") != "introduction"]
    rng.shuffle(rest)

    picked: list[dict] = []
    if intro:
        first = rng.choice(intro)
        picked.append(first)
        rest = [q for q in rest if q.get("id") != first.get("id")]

    need = target - len(picked)
    if need > 0:
        if len(rest) >= need:
            picked.extend(rest[:need])
        else:
            picked.extend(rest)
            remaining_ids = {p.get("id") for p in picked}
            extra_pool = [q for q in available if q.get("id") not in remaining_ids]
            rng.shuffle(extra_pool)
            for q in extra_pool:
                if len(picked) >= target:
                    break
                picked.append(q)

    # Mélanger sauf garder intro en première position
    if len(picked) > 1:
        head = picked[0]
        tail = picked[1:]
        rng.shuffle(tail)
        picked = [head] + tail

    return [
        {"id": str(q.get("id", f"q_{i}")), "question": q["_formatted"]}
        for i, q in enumerate(picked[:target])
    ]


def pick_question_strings(
    job_role: str,
    count: int | None = None,
    **kwargs,
) -> list[str]:
    return [x["question"] for x in pick_interview_questions(job_role, count, **kwargs)]
