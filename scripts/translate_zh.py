from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description="Add Chinese title and abstract translations to data/papers.json.")
    parser.add_argument("--input", type=Path, default=ROOT / "data" / "papers.json")
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "papers.json")
    parser.add_argument("--limit", type=int, default=0, help="Maximum papers to translate. 0 means no limit.")
    args = parser.parse_args()

    payload = json.loads(args.input.read_text(encoding="utf-8"))
    translator = make_translator()
    if translator is None:
        print(
            "No translation backend configured. Set BAIDU_TRANSLATE_APP_ID and "
            "BAIDU_TRANSLATE_SECRET_KEY to enable Chinese translation."
        )
        return

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
    print(f"Translated {changed} papers")


def make_translator():
    baidu_app_id = os.environ.get("BAIDU_TRANSLATE_APP_ID")
    baidu_secret_key = os.environ.get("BAIDU_TRANSLATE_SECRET_KEY")
    if baidu_app_id and baidu_secret_key:
        return lambda text: translate_baidu(text, baidu_app_id, baidu_secret_key)

    deepl_key = os.environ.get("DEEPL_API_KEY")
    if deepl_key:
        return lambda text: translate_deepl(text, deepl_key)

    libre_url = os.environ.get("LIBRETRANSLATE_URL")
    if libre_url:
        libre_key = os.environ.get("LIBRETRANSLATE_API_KEY", "")
        return lambda text: translate_libretranslate(text, libre_url, libre_key)

    return None


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
