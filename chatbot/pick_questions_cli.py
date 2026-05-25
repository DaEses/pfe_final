"""CLI pour le backend NestJS : retourne des questions JSON sur stdout."""
import argparse
import json
import sys

from question_picker import pick_interview_questions


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--job-role", required=True)
    parser.add_argument("--count", type=int, default=None)
    parser.add_argument("--exclude-ids", default="", help="Comma-separated question ids")
    parser.add_argument("--exclude-texts-file", default="", help="JSON file with string array")
    args = parser.parse_args()

    exclude_ids = [x.strip() for x in args.exclude_ids.split(",") if x.strip()]
    exclude_texts: list[str] = []
    if args.exclude_texts_file and args.exclude_texts_file.strip():
        with open(args.exclude_texts_file, "r", encoding="utf-8") as fp:
            data = json.load(fp)
            if isinstance(data, list):
                exclude_texts = [str(x) for x in data]

    items = pick_interview_questions(
        args.job_role,
        args.count,
        exclude_ids=exclude_ids,
        exclude_texts=exclude_texts,
    )
    json.dump({"questions": items}, sys.stdout, ensure_ascii=False)
    sys.stdout.flush()


if __name__ == "__main__":
    main()
