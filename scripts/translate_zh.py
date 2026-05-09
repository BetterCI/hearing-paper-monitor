from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import time
from pathlib import Path

import requests

from paper_monitor.storage import connect, import_json

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description="Add Chinese title and abstract translations to data/papers.json.")
    parser.add_argument("--input", type=Path, default=ROOT / "data" / "papers.json")
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "papers.json")
    parser.add_argument("--limit", type=int, default=0, help="Maximum papers to translate. 0 means no limit.")
    parser.add_argument("--text", help="Translate one text string and print the result without editing JSON.")
    parser.add_argument("--require-backend", action="store_true", help="Exit with an error if no translation backend is configured.")
    args = parser.parse_args()

    translator = make_translator()
    if translator is None:
        message = (
            "No translation backend configured. Set BAIDU_TRANSLATE_APP_ID and "
            "BAIDU_TRANSLATE_SECRET_KEY to enable Chinese translation."
        )
        if args.require_backend:
            raise RuntimeError(message)
        print(message)
        return

    if args.text:
        print(translator(args.text))
        return

    payload = json.loads(args.input.read_text(encoding="utf-8"))

    changed = 0
    for paper in payload.get("papers", []):
        if args.limit and changed >= args.limit:
            break

        paper_changed = False
        if paper.get("title") and not paper.get("title_zh"):
            paper["title_zh"] = translator(paper["title"])
            paper_changed = True
            time.sleep(0.2)

        if paper.get("abstract") and not paper.get("abstract_zh"):
            paper["abstract_zh"] = translator(paper["abstract"])
            paper_changed = True
            time.sleep(0.2)

        if paper_changed:
            changed += 1

    args.output.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    sync_sqlite(args.output)
    print(f"Translated {changed} papers")


def sync_sqlite(json_path: Path) -> None:
    db_path = ROOT / "papers.sqlite"
    conn = connect(db_path)
    import_json(conn, json_path)


def make_translator():
    baidu_app_id = _env("BAIDU_TRANSLATE_APP_ID")
    baidu_secret_key = _env("BAIDU_TRANSLATE_SECRET_KEY")
    if baidu_app_id and baidu_secret_key:
        return lambda text: translate_baidu(text, baidu_app_id, baidu_secret_key)

    deepl_key = _env("DEEPL_API_KEY")
    if deepl_key:
        return lambda text: translate_deepl(text, deepl_key)

    libre_url = _env("LIBRETRANSLATE_URL")
    if libre_url:
        libre_key = _env("LIBRETRANSLATE_API_KEY") or ""
        return lambda text: translate_libretranslate(text, libre_url, libre_key)

    return None


def _env(name: str) -> str | None:
    value = os.environ.get(name)
    if value is None:
        return None
    return value.strip()


def translate_baidu(text: str, app_id: str, secret_key: str) -> str:
    salt = str(random.randint(32768, 65536))
    sign_source = f"{app_id}{text}{salt}{secret_key}"
    sign = hashlib.md5(sign_source.encode("utf-8")).hexdigest()
    response = requests.post(
        "https://fanyi-api.baidu.com/api/trans/vip/translate",
        data={
            "q": text,
            "from": "en",
            "to": "zh",
            "appid": app_id,
            "salt": salt,
            "sign": sign,
        },
        timeout=60,
    )
    response.raise_for_status()
    payload = response.json()
    if "error_code" in payload:
        raise RuntimeError(f"Baidu Translate error {payload.get('error_code')}: {payload.get('error_msg')}")
    return "\n".join(item["dst"] for item in payload.get("trans_result", []))


def translate_deepl(text: str, api_key: str) -> str:
    api_url = os.environ.get("DEEPL_API_URL") or "https://api-free.deepl.com/v2/translate"
    response = requests.post(
        api_url,
        data={
            "auth_key": api_key,
            "text": text,
            "target_lang": "ZH",
        },
        timeout=60,
    )
    response.raise_for_status()
    translations = response.json().get("translations", [])
    if not translations:
        raise RuntimeError("DeepL returned no translations")
    return translations[0]["text"]


def translate_libretranslate(text: str, base_url: str, api_key: str) -> str:
    response = requests.post(
        base_url.rstrip("/") + "/translate",
        json={
            "q": text,
            "source": "en",
            "target": "zh",
            "format": "text",
            "api_key": api_key,
        },
        timeout=60,
    )
    response.raise_for_status()
    return response.json()["translatedText"]


if __name__ == "__main__":
    main()
