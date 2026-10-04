# Hearing Science Paper Monitor

A small web-based monitoring dashboard for new papers in hearing science, psychoacoustics, and related clinical audiology journals.

## Target Journals

- The Journal of the Acoustical Society of America (JASA)
- JASA Express Letters
- Trends in Hearing
- Journal of the Association for Research in Otolaryngology (JARO)
- Ear and Hearing
- Hearing Research

All monitored journals are treated equally at the journal level. For JASA and JASA Express Letters, the dashboard additionally highlights articles in these sections:

- Psychological and Physiological Acoustics
- Speech Communication

## What It Does

- Collects paper metadata from Crossref, PubMed, RSS feeds, and lightweight journal TOC pages when configured.
- Stores title, authors, journal, publication date, DOI, URL, abstract, section, and keywords.
- Deduplicates by DOI, with a title/date fallback for records without a DOI.
- Classifies papers into rule-based tags and displays clean public academic labels such as:
  - Cochlear Implants
  - Hearing Aids
  - Speech Perception
  - Psychoacoustics
  - Auditory Neuroscience
  - Clinical Audiology
  - Machine Learning
  - Real-world Listening
  - Artificial Hearing
  - Hearing Healthcare AI
  - Auditory Prostheses
  - Binaural Hearing
  - Speech-in-Noise
  - Objective Evaluation
  - Auditory Physiology
- Exports a static JSON file at `data/papers.json`.
- Renders a searchable, filterable static web dashboard.
- Defaults to Recently added, ordered by first collection time across all publication months; monthly and early-access views remain available.
- Shows papers added in the last seven calendar days, with a View all button, separately from up to five recent publication picks from the last seven calendar days.
- Keeps hearing and speech papers from JASA/JASA-EL visible even when section metadata is missing. Title, author, and DOI searches bypass implicit month and other-JASA-section exclusions; explicit journal, section, and tag filters still apply.
- Checks for updated data every five minutes while visible and when returning to the page, preserves active filters, and keeps the current data if a refresh fails.
- Displays the original English metadata by default. Translation is not run automatically.
- Never downloads or stores PDFs.
- Links only to official publisher pages, PubMed pages, or DOI pages.
- Exports each paper as RIS or BibTeX for reference managers such as Zotero, EndNote, Mendeley, and BibTeX workflows.
- Copies DOI, DOI link, or publisher link directly to clipboard.

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

# Run frontend regression tests (Node.js 18 or newer)
node --test tests/frontend.test.cjs
```

## Configuration

Journal sources and matching rules live in `config/journals.yml`.

The first version uses Crossref and PubMed as the most robust sources. RSS and TOC fetching are supported by the collector, but publisher feed and page URLs are intentionally configurable because journals change those endpoints more often than Crossref/PubMed APIs.

## Optional Manual Translation

The dashboard defaults to English and does not translate papers automatically. The data schema still tolerates optional translated fields for backwards compatibility:

```json
{
  "title_zh": "中文题名",
  "abstract_zh": "中文摘要"
}
```

The collector keeps the official English metadata intact. If translation is needed, run it manually as a separate step so DOI deduplication and publisher links remain unchanged.

Optional manual translation providers:

- `DEEPL_API_KEY`: uses DeepL Free by default.
- `LIBRETRANSLATE_URL`: uses a LibreTranslate-compatible endpoint.

Optional secrets:

- `DEEPL_API_URL`: set to `https://api.deepl.com/v2/translate` for DeepL Pro.
- `LIBRETRANSLATE_API_KEY`: only needed if your LibreTranslate server requires a key.

Run locally:

```powershell
python scripts/translate_zh.py
```

## AI-Generated Abstract Analysis

The dashboard can display optional AI-generated abstract analysis with four fields:

- scientific question
- key highlight
- main limitation
- research implication

The analysis is generated server-side with DeepSeek and saved in `data/papers.json` as `ai_analysis`. API keys remain in GitHub Actions; the browser receives only the saved analysis. The default model is `deepseek-flash`, with JSON output and thinking disabled for short abstract analysis.

In [repository Settings → Secrets and variables → Actions](https://github.com/BetterCI/hearing-paper-monitor/settings/secrets/actions), add a repository secret named `DEEPSEEK_API_KEY`. Create the key on the [DeepSeek platform](https://platform.deepseek.com/api_keys). Optional **repository variables** are `DEEPSEEK_API_BASE` (default `https://api.deepseek.com`), `DEEPSEEK_MODEL` and `DEEPSEEK_ANALYSIS_LANGUAGE` (default `zh`). Never place keys in site files or browser settings.

Each daily update attempts at most six analyses within 270 seconds. Newly collected core papers without an analysis come first; older MiniMax analyses remain visible with a legacy label until replaced. Valid DeepSeek caches are reused while their title/abstract hash and prompt version match. Use `--refresh` only for an intentional rerun. New analyses include exact abstract quotes; missing limitations are reported as insufficient information instead of invented generic weaknesses. A failed request preserves the existing analysis. `data/analysis_status.json` records configuration, failures and pending analyses.

Run **Actions → Update paper monitor → Run workflow** to collect metadata and verify the configured API. A main-branch commit with `[refresh-data]` in its message also requests a complete backend update; ordinary code pushes only test and deploy.

```powershell
# Set DEEPSEEK_API_KEY in your environment before running (do not commit it).
python scripts/analyze_with_deepseek.py --limit 6
```

The previous MiniMax script is retained for historical compatibility. The optional Cloudflare worker is separate from this scheduled analysis pipeline and inline generation remains disabled.

## Collection and reading workflow

The existing journal configuration is unchanged. Core journals use a 60-day publication lookback, Crossref publication/online/creation-date queries with cursor pagination, and paginated PubMed publication/creation-date searches. Late deposits with only a month or year date are included. Transient network errors retry; partial source failures preserve successful pages. `data/source_status.json` exposes per-journal source counts, newly added records, checks and last complete fetch times. A successful source check establishes fetch completion, not publisher completeness.

Search includes abstracts by default. Separate words must all match, quoted phrases match together, `OR` separates alternatives, and a leading `-` excludes a term. Topic tags can be combined with all/any matching. Article categories use explicit title cues and preprint source metadata; they are not verified study-design classifications. Clear all filters resets the list to recently added papers. Advanced filters and the digest collapse initially on phones.

Cards show the full available abstract by default, preserving structured sections and highlighted conclusions. Missing abstracts are labeled explicitly. At viewport widths of 1024 pixels or more, the paper list displays two cards per row; smaller screens use one column. Expand a card to read its saved AI analysis, figures and personal notes. Save/read/later markers and notes use browser-local storage. **Export library backup** saves a versioned JSON backup; import merges by modification time. These records do not sync automatically between browsers. Select individual papers or all matching results, then export one RIS or BibTeX file. Exported journal names use the actual journal and batch BibTeX keys are unique.

## Citation Export

Each paper card on the dashboard has a **Cite / Save** button that generates citation metadata dynamically in the browser:

- **Download RIS** — Downloads a `.ris` file compatible with Zotero, EndNote, Mendeley, and other reference managers.
- **Download BibTeX** — Downloads a `.bib` file for BibTeX-based workflows.
- **Copy DOI** — Copies the raw DOI (e.g., `10.1016/j.heares.2026.109633`).
- **Copy DOI link** — Copies the full DOI URL.
- **Copy publisher link** — Copies the official publisher URL when available.

Citation keys in BibTeX are derived from the first author's surname, publication year, and a shortened title. Special characters are escaped automatically. AI-generated abstract analysis fields are excluded from RIS/BibTeX exports to keep them focused on bibliographic metadata only.

Options are hidden when the underlying data is not available (e.g., Copy DOI is hidden if the paper has no DOI).

## GitHub Pages

The workflow in `.github/workflows/update-papers.yml` runs daily, commits refreshed `data/papers.json`, and can publish the static dashboard through GitHub Pages if Pages is enabled for the repository.
