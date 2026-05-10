from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]

DEFAULT_API_BASE = "https://api.minimaxi.com/v1"
DEFAULT_MODEL = "MiniMax-M2.7"
REQUIRED_FIELDS = ("scientific_question", "key_highlight", "main_limitation")


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze paper abstracts with the MiniMax API.")
    parser.add_argument("--input", type=Path, default=ROOT / "data" / "papers.json")
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "papers.json")
    parser.add_argument("--limit", type=int, default=40, help="Maximum abstracts to analyze per run. 0 means no limit.")
    parser.add_argument("--refresh", action="store_true", help="Recompute existing MiniMax analyses.")
    parser.add_argument("--language", default=os.getenv("MINIMAX_ANALYSIS_LANGUAGE") or "en")
    args = parser.parse_args()

    api_key = os.getenv("MINIMAX_API_KEY")
    if not api_key:
        print("MiniMax analysis skipped: MINIMAX_API_KEY is not configured.")
        return

    payload = json.loads(args.input.read_text(encoding="utf-8"))
    papers = payload.get("papers", [])
    client = MiniMaxClient(
        api_key=api_key,
        api_base=os.getenv("MINIMAX_API_BASE") or DEFAULT_API_BASE,
        model=os.getenv("MINIMAX_MODEL") or DEFAULT_MODEL,
    )

    analyzed = 0
    changed = 0
    for paper in papers:
        if args.limit and analyzed >= args.limit:
            break
        if not should_analyze(paper, refresh=args.refresh):
            continue
        analyzed += 1
        try:
            analysis = client.analyze(paper, language=args.language)
        except requests.RequestException as exc:
            print(f"Warning: MiniMax request failed for {paper_label(paper)}: {exc}")
            continue
        except ValueError as exc:
            print(f"Warning: MiniMax response could not be used for {paper_label(paper)}: {exc}")
            continue

        paper["ai_analysis"] = {
            **analysis,
            "provider": "minimax",
            "model": client.model,
            "language": args.language,
            "abstract_hash": abstract_hash(paper),
            "updated_at": utc_now(),
        }
        changed += 1
        time.sleep(0.2)

    if changed:
        args.output.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"MiniMax analysis complete: inspected {analyzed}, updated {changed}")


class MiniMaxClient:
    def __init__(self, api_key: str, api_base: str, model: str) -> None:
        self.api_key = api_key
        self.api_base = api_base.rstrip("/")
        self.model = model
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "hearing-paper-monitor/0.1 (+https://github.com/BetterCI/hearing-paper-monitor)",
            }
        )

    def analyze(self, paper: dict, language: str) -> dict:
        response = self.session.post(
            f"{self.api_base}/chat/completions",
            json={
                "model": self.model,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are a cautious hearing-science and psychoacoustics research assistant. "
                            "Analyze only what is supported by the title and abstract. Return strict JSON only."
                        ),
                    },
                    {"role": "user", "content": prompt_for_paper(paper, language)},
                ],
                "temperature": 0.2,
                "max_tokens": 700,
            },
            timeout=60,
        )
        response.raise_for_status()
        content = extract_message_content(response.json())
        return validate_analysis(parse_json_object(content))


def should_analyze(paper: dict, refresh: bool) -> bool:
    abstract = (paper.get("abstract") or "").strip()
    if len(abstract) < 120:
        return False
    if refresh:
        return True
    analysis = paper.get("ai_analysis") or {}
    return analysis.get("abstract_hash") != abstract_hash(paper) or not all(analysis.get(field) for field in REQUIRED_FIELDS)


def prompt_for_paper(paper: dict, language: str) -> str:
    target = "Chinese" if language.lower().startswith("zh") else "English"
    abstract = " ".join((paper.get("abstract") or "").split())[:6000]
    keywords = ", ".join(paper.get("keywords") or [])
    tags = ", ".join(paper.get("tags") or [])
    return f"""
Analyze this paper abstract for a literature-monitoring dashboard.

Return a compact JSON object with exactly these keys:
{{
  "scientific_question": "one sentence describing the central scientific question",
  "key_highlight": "one sentence describing the strongest finding or methodological highlight",
  "main_limitation": "one sentence describing the main limitation or uncertainty; use 'Not stated in the abstract' if the abstract does not support a limitation"
}}

Write the values in {target}. Avoid hype. Do not mention PDFs. Do not invent sample sizes, methods, or conclusions.

Title: {paper.get("title") or ""}
Journal: {paper.get("journal") or ""}
Section: {paper.get("section") or ""}
Tags: {tags}
Keywords: {keywords}
Abstract: {abstract}
""".strip()


def extract_message_content(payload: dict) -> str:
    choices = payload.get("choices") or []
    if not choices:
        raise ValueError("response has no choices")
    message = choices[0].get("message") or {}
    content = message.get("content") or choices[0].get("text") or ""
    if not content:
        raise ValueError("response has no content")
    return re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()


def parse_json_object(content: str) -> dict:
    cleaned = content.strip()
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE)
    try:
        value = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
        if not match:
            raise ValueError("no JSON object found in response") from None
        value = json.loads(match.group(0))
    if not isinstance(value, dict):
        raise ValueError("response JSON is not an object")
    return value


def validate_analysis(value: dict) -> dict:
    cleaned = {}
    for field in REQUIRED_FIELDS:
        text = " ".join(str(value.get(field) or "").split())
        if not text:
            raise ValueError(f"missing {field}")
        cleaned[field] = text
    return cleaned


def abstract_hash(paper: dict) -> str:
    text = "\n".join([paper.get("title") or "", paper.get("abstract") or ""])
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def paper_label(paper: dict) -> str:
    return paper.get("doi") or paper.get("title") or "unknown paper"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


if __name__ == "__main__":
    main()
