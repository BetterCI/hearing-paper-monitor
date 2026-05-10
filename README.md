# Hearing Science Paper Monitor

A small web-based monitoring dashboard for new papers in hearing science, psychoacoustics, and related clinical audiology journals.

## Target Journals

- The Journal of the Acoustical Society of America (JASA)
- JASA Express Letters
- Trends in Hearing
- Journal of the Association for Research in Otolaryngology (JARO)
- Ear and Hearing
- Hearing Research

For JASA and JASA Express Letters, the classifier highlights articles in or related to:

- Psychological and Physiological Acoustics
- Speech Communication

## What It Does

- Collects paper metadata from Crossref, PubMed, RSS feeds, and lightweight journal TOC pages when configured.
- Stores title, authors, journal, publication date, DOI, URL, abstract, section, and keywords.
- Deduplicates by DOI, with a title/date fallback for records without a DOI.
- Classifies papers into rule-based tags:
  - cochlear implant
  - hearing aid
  - psychoacoustics
  - speech perception
  - auditory physiology
  - clinical audiology
  - machine learning
  - real-world listening
- Exports a static JSON file at `data/papers.json`.
- Renders a searchable, filterable static web dashboard.
- Displays optional Chinese translations when `title_zh` and `abstract_zh` are present in `data/papers.json`.
- Never downloads or stores PDFs.
- Links only to official publisher pages, PubMed pages, or DOI pages.

## Quick Start

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python scripts/collect.py --days 60
python -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

## Useful Commands

```powershell
# Refresh metadata
python scripts/collect.py --days 30

# Rebuild the static frontend data only
python scripts/export_static.py

# Run tests
python -m pytest
```

## Configuration

Journal sources and matching rules live in `config/journals.yml`.

The first version uses Crossref and PubMed as the most robust sources. RSS and TOC fetching are supported by the collector, but publisher feed and page URLs are intentionally configurable because journals change those endpoints more often than Crossref/PubMed APIs.

## Chinese Translation Fields

The dashboard supports bilingual display when each paper includes optional fields:

```json
{
  "title_zh": "中文题名",
  "abstract_zh": "中文摘要"
}
```

The collector keeps the official English metadata intact. Add translation generation as a separate step so DOI deduplication and publisher links remain unchanged.

To generate Chinese translations automatically in GitHub Actions, configure one of these providers:

- `DEEPL_API_KEY`: uses DeepL Free by default.
- `LIBRETRANSLATE_URL`: uses a LibreTranslate-compatible endpoint.

Optional secrets:

- `DEEPL_API_URL`: set to `https://api.deepl.com/v2/translate` for DeepL Pro.
- `LIBRETRANSLATE_API_KEY`: only needed if your LibreTranslate server requires a key.

Run locally:

```powershell
python scripts/translate_zh.py
```

## MiniMax Abstract Analysis

The dashboard can display optional AI-generated abstract analysis with three fields:

- scientific question
- key highlight
- main limitation

The analysis is generated server-side and stored in `data/papers.json` as `ai_analysis`; the browser never sees the MiniMax API key.
Each paper is analyzed only once by default. Future workflow runs skip papers that already have a complete `ai_analysis` block, so existing abstracts do not repeatedly spend MiniMax tokens. Use `--refresh` only when you intentionally want to recompute existing analyses.

To enable it in GitHub Actions, add this repository secret:

- `MINIMAX_API_KEY`

Optional settings:

- `MINIMAX_API_BASE`: defaults to `https://api.minimaxi.com/v1`. Set to `https://api.minimax.io/v1` if your account uses the international endpoint.
- `MINIMAX_MODEL`: defaults to `MiniMax-M2.7`.
- Repository variable `MINIMAX_ANALYSIS_LANGUAGE`: defaults to `en`; set to `zh` for Chinese analysis text.

Run locally:

```powershell
$env:MINIMAX_API_KEY="your-key"
python scripts/analyze_with_minimax.py --limit 10
```

## GitHub Pages

The workflow in `.github/workflows/update-papers.yml` runs daily, commits refreshed `data/papers.json`, and can publish the static dashboard through GitHub Pages if Pages is enabled for the repository.
