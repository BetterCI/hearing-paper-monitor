const state = {
  papers: [],
  targetLanguage: detectPreferredTargetLanguage(),
  translatedTitles: new Map(),
  titleTranslationStatus: "idle",
  filters: {
    query: "",
    journal: "",
    section: "",
    tag: "",
    days: "",
    month: "",
    showNonPriorityJasa: false,
  },
};

const EARLY_ACCESS_MONTH = "__early_access";

const LANGUAGE_OPTIONS = [
  ["zh", "简体中文"],
  ["zh-Hant", "繁體中文"],
  ["original", "Original English"],
  ["ar", "Arabic"],
  ["bn", "Bengali"],
  ["cs", "Czech"],
  ["da", "Danish"],
  ["de", "German"],
  ["el", "Greek"],
  ["es", "Spanish"],
  ["fi", "Finnish"],
  ["fr", "French"],
  ["hi", "Hindi"],
  ["hr", "Croatian"],
  ["hu", "Hungarian"],
  ["id", "Indonesian"],
  ["it", "Italian"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
  ["nl", "Dutch"],
  ["no", "Norwegian"],
  ["pl", "Polish"],
  ["pt", "Portuguese"],
  ["ro", "Romanian"],
  ["ru", "Russian"],
  ["sk", "Slovak"],
  ["sl", "Slovenian"],
  ["sv", "Swedish"],
  ["ta", "Tamil"],
  ["te", "Telugu"],
  ["th", "Thai"],
  ["tr", "Turkish"],
  ["uk", "Ukrainian"],
  ["vi", "Vietnamese"],
];

const JOURNAL_STYLES = {
  "The Journal of the Acoustical Society of America": { color: "#0b6f72", background: "#eef8f7", logo: "JASA", sublogo: "ASA" },
  "JASA Express Letters": { color: "#7c3aed", background: "#f3edff", logo: "JASA", sublogo: "EL" },
  "Trends in Hearing": { color: "#d97706", background: "#fff7e8", logo: "TiH", sublogo: "SAGE" },
  "Journal of the Association for Research in Otolaryngology": { color: "#2563eb", background: "#edf4ff", logo: "JARO", sublogo: "ARO" },
  "Ear and Hearing": { color: "#c026d3", background: "#fdf0ff", logo: "E&H", sublogo: "AAS" },
  "Hearing Research": { color: "#15803d", background: "#effaf2", logo: "HR", sublogo: "ELS" },
};

const RELEVANT_TAGS = new Set([
  "cochlear implant",
  "hearing aid",
  "psychoacoustics",
  "speech perception",
  "auditory physiology",
  "clinical audiology",
  "real-world listening",
]);

const RELEVANT_TERMS = [
  "hearing",
  "auditory",
  "cochlear",
  "otolaryngology",
  "audiology",
  "audiogram",
  "tinnitus",
  "speech",
  "speech-in-noise",
  "speech in noise",
  "speech perception",
  "speech recognition",
  "speech intelligibility",
  "psychoacoustic",
  "masking",
  "loudness",
  "pitch",
  "listening",
  "hearing aid",
  "cochlear implant",
  "otoacoustic",
  "brainstem response",
  "auditory cortex",
];

const JASA_JOURNALS = new Set([
  "The Journal of the Acoustical Society of America",
  "JASA Express Letters",
]);

const CONCLUSION_CUES = [
  "we conclude",
  "we found",
  "we show",
  "we demonstrate",
  "we suggest",
  "results show",
  "results suggest",
  "results indicate",
  "findings suggest",
  "findings indicate",
  "these findings",
  "this study shows",
  "this study demonstrates",
  "this study suggests",
  "the results show",
  "the results suggest",
  "the results indicate",
  "demonstrate that",
  "suggest that",
  "indicate that",
  "revealed that",
  "showed that",
  "found that",
  "support the",
  "highlight",
  "benefit",
  "improve",
  "in conclusion",
  "consequently",
];

const CODE_URL_PATTERN = /(https?:\/\/(?:github\.com|gitlab\.com|bitbucket\.org|zenodo\.org|osf\.io|figshare\.com|codeocean\.com|huggingface\.co|sourceforge\.net)\/[^\s)"'<>]+)/i;

const CODE_CUES = [
  "code is available",
  "source code",
  "analysis code",
  "open-source code",
  "open source code",
  "software is available",
  "repository",
  "github.com",
  "gitlab.com",
  "code ocean",
  "codeocean",
  "osf.io",
  "zenodo.org",
  "huggingface.co",
];

const els = {
  papers: document.querySelector("#papers"),
  empty: document.querySelector("#emptyState"),
  search: document.querySelector("#searchInput"),
  journal: document.querySelector("#journalFilter"),
  section: document.querySelector("#sectionFilter"),
  tag: document.querySelector("#tagFilter"),
  date: document.querySelector("#dateFilter"),
  month: document.querySelector("#monthFilter"),
  showNonPriorityJasa: document.querySelector("#showNonPriorityJasa"),
  paperCount: document.querySelector("#paperCount"),
  generatedAt: document.querySelector("#generatedAt"),
  refreshData: document.querySelector("#refreshData"),
  translationStatus: null,
  priorityCount: document.querySelector("#priorityCount"),
  journalCount: document.querySelector("#journalCount"),
  tagCount: document.querySelector("#tagCount"),
};

init();

function detectPreferredTargetLanguage() {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language || "en"];
  for (const language of languages) {
    const normalized = language.toLowerCase();
    if (normalized.startsWith("en")) return "original";
    if (normalized === "zh-tw" || normalized === "zh-hk" || normalized === "zh-mo" || normalized.includes("hant")) return "zh-Hant";
    if (normalized.startsWith("zh")) return "zh";
    const base = normalized.split("-")[0];
    if (LANGUAGE_OPTIONS.some(([code]) => code === base)) return base;
  }
  return "original";
}

async function init() {
  await loadData();
  populateFilters();
  addLanguageControl();
  bindFilters();
  render();
}

async function loadData() {
  try {
    const response = await fetch(`data/papers.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    state.papers = payload.papers || [];
    state.translatedTitles.clear();
    state.titleTranslationStatus = "idle";
    els.generatedAt.textContent = payload.generated_at ? `Updated ${formatDateTime(payload.generated_at)}` : "Not yet updated";
  } catch (error) {
    els.generatedAt.textContent = "No data file found";
    state.papers = [];
  }
}

function addLanguageControl() {
  const controls = document.querySelector(".controls");
  const label = document.createElement("label");
  label.className = "browser-translate";
  label.innerHTML = `
    <span>Browser Translate</span>
    <select id="languageFilter">
    </select>
    <small id="translationStatus" class="translate-status">Original English</small>
  `;
  controls.appendChild(label);
  els.language = document.querySelector("#languageFilter");
  els.translationStatus = document.querySelector("#translationStatus");
  LANGUAGE_OPTIONS.forEach(([value, labelText]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labelText;
    els.language.appendChild(option);
  });
  els.language.value = state.targetLanguage;
}

function bindFilters() {
  els.search.addEventListener("input", () => {
    state.filters.query = els.search.value.trim().toLowerCase();
    render();
  });
  els.journal.addEventListener("change", () => {
    state.filters.journal = els.journal.value;
    render();
  });
  els.section.addEventListener("change", () => {
    state.filters.section = els.section.value;
    render();
  });
  els.tag.addEventListener("change", () => {
    state.filters.tag = els.tag.value;
    render();
  });
  els.date.addEventListener("change", () => {
    state.filters.days = els.date.value;
    render();
  });
  els.month.addEventListener("change", () => {
    state.filters.month = els.month.value;
    render();
  });
  els.showNonPriorityJasa.addEventListener("change", () => {
    state.filters.showNonPriorityJasa = els.showNonPriorityJasa.checked;
    render();
  });
  els.refreshData.addEventListener("click", async () => {
    els.refreshData.disabled = true;
    els.refreshData.textContent = "Refreshing...";
    await loadData();
    populateFilters();
    render();
    els.refreshData.textContent = "Refresh";
    els.refreshData.disabled = false;
  });
  els.language.addEventListener("change", () => {
    state.targetLanguage = els.language.value;
    render();
  });
}

function populateFilters() {
  fillSelect(els.journal, unique(state.papers.map((paper) => paper.journal)));
  fillSelect(els.section, unique(state.papers.map((paper) => paper.section).filter(Boolean)));
  fillSelect(els.tag, unique(state.papers.flatMap((paper) => paper.tags || [])));
  populateMonthFilter();
}

function fillSelect(select, values) {
  const first = select.options[0];
  select.replaceChildren(first);
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function render() {
  const papers = state.papers.filter(matchesFilters);
  els.paperCount.textContent = `${papers.length} ${papers.length === 1 ? "paper" : "papers"}`;
  els.priorityCount.textContent = state.papers.filter(isPriority).length;
  els.journalCount.textContent = unique(state.papers.map((paper) => paper.journal)).length;
  els.tagCount.textContent = unique(state.papers.flatMap((paper) => paper.tags || [])).length;

  els.papers.replaceChildren(...papers.map(renderPaper));
  els.empty.hidden = papers.length > 0;
  translateVisibleTitles(papers);
  translateRenderedPapers();
}

function populateMonthFilter() {
  const months = unique(state.papers.map(getPaperMonth).filter(Boolean)).sort().reverse();
  const hasEarlyAccess = state.papers.some(isEarlyAccess);
  const options = hasEarlyAccess ? [...months, EARLY_ACCESS_MONTH] : months;
  els.month.replaceChildren();
  months.forEach((month) => {
    const option = document.createElement("option");
    option.value = month;
    option.textContent = formatMonth(month);
    els.month.appendChild(option);
  });
  if (hasEarlyAccess) {
    const option = document.createElement("option");
    option.value = EARLY_ACCESS_MONTH;
    option.textContent = "Early access";
    els.month.appendChild(option);
  }

  if (!state.filters.month || !options.includes(state.filters.month)) {
    state.filters.month = months[0] || "";
  }
  els.month.value = state.filters.month;
}

function matchesFilters(paper) {
  const queryText = [
    paper.title,
    paper.title_zh,
    paper.chinese_title,
    (paper.authors || []).join(" "),
    paper.journal,
    paper.doi,
    paper.abstract,
    paper.abstract_zh,
    paper.chinese_abstract,
    paper.section,
    paper.publication_stage,
    (paper.keywords || []).join(" "),
    (paper.tags || []).join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (state.filters.query && !queryText.includes(state.filters.query)) return false;
  if (state.filters.journal && paper.journal !== state.filters.journal) return false;
  if (state.filters.section && paper.section !== state.filters.section) return false;
  if (state.filters.tag && !(paper.tags || []).includes(state.filters.tag)) return false;
  if (state.filters.days && !withinDays(paper.publication_date, Number(state.filters.days))) return false;
  if (state.filters.month === EARLY_ACCESS_MONTH && !isEarlyAccess(paper)) return false;
  if (state.filters.month && state.filters.month !== EARLY_ACCESS_MONTH && getPaperMonth(paper) !== state.filters.month) return false;
  if (!state.filters.showNonPriorityJasa && isNonPriorityJasaPaper(paper)) return false;
  return true;
}

function renderPaper(paper) {
  const article = document.createElement("article");
  const related = isSpeechOrHearingRelated(paper);
  const jasaOffTopic = JASA_JOURNALS.has(paper.journal) && !related;
  article.className = [
    "paper",
    related ? "related-paper" : "",
    jasaOffTopic ? "jasa-offtopic" : "",
    isPriority(paper) ? "priority" : "",
  ]
    .filter(Boolean)
    .join(" ");
  applyJournalStyle(article, paper.journal);

  const heading = document.createElement("div");
  heading.className = "paper-heading";
  heading.appendChild(renderJournalLogo(paper.journal));

  const title = document.createElement("h2");
  const link = document.createElement("a");
  link.href = paper.url || (paper.doi ? `https://doi.org/${paper.doi}` : "#");
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = displayTitle(paper);
  title.appendChild(link);
  heading.appendChild(title);

  const translatedTitle = renderTranslatedTitle(paper);
  if (translatedTitle) {
    heading.appendChild(translatedTitle);
  }

  const meta = document.createElement("div");
  meta.className = "meta";
  [
    paper.journal,
    formatDate(paper.publication_date),
    paper.section,
    authorLine(paper.authors),
    paper.first_author_affiliation ? `First affiliation: ${paper.first_author_affiliation}` : null,
  ]
    .filter(Boolean)
    .forEach((text) => {
      meta.appendChild(renderMetaText(text));
    });
  if (isEarlyAccess(paper)) {
    meta.appendChild(renderStageBadge("Early access"));
  }
  if (paper.doi) {
    meta.appendChild(renderMetaLink(`DOI: ${paper.doi}`, doiUrl(paper.doi)));
  }

  const fullTextUrl = getFullTextUrl(paper);
  if (fullTextUrl) {
    meta.appendChild(renderMetaLink("Full text", fullTextUrl));
  }

  const codeInfo = getCodeInfo(paper);
  if (codeInfo) {
    meta.appendChild(renderCodeLink(codeInfo));
  }

  article.append(heading, meta);

  const abstractText = displayAbstract(paper);
  if (abstractText) {
    article.appendChild(renderAbstract(abstractText));
  }

  const media = renderKeyMedia(paper);
  if (media) {
    article.appendChild(media);
  }

  const chips = document.createElement("div");
  chips.className = "chips";
  (paper.tags || []).forEach((tag) => {
    const chip = document.createElement("span");
    chip.className = `chip${tag === "priority section" ? " priority-chip" : ""}`;
    chip.textContent = tag;
    chips.appendChild(chip);
  });
  article.appendChild(chips);
  return article;
}

function applyJournalStyle(element, journal) {
  const style = JOURNAL_STYLES[journal] || { color: "#64748b", background: "#f8fafc" };
  element.style.setProperty("--journal-color", style.color);
  element.style.setProperty("--journal-bg", style.background);
}

function renderJournalLogo(journal) {
  const style = JOURNAL_STYLES[journal] || { logo: "J", sublogo: "JOURNAL" };
  const logo = document.createElement("div");
  logo.className = "journal-logo";
  logo.setAttribute("aria-label", `${journal} logo`);
  logo.title = journal;

  const main = document.createElement("span");
  main.className = "journal-logo-main";
  main.textContent = style.logo;

  const sub = document.createElement("span");
  sub.className = "journal-logo-sub";
  sub.textContent = style.sublogo;

  logo.append(main, sub);
  return logo;
}

function renderMetaText(text) {
  const span = document.createElement("span");
  span.textContent = text;
  return span;
}

function renderMetaLink(text, url) {
  const link = document.createElement("a");
  link.className = "meta-link";
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = text;
  return link;
}

function renderCodeLink(codeInfo) {
  if (codeInfo.url) {
    const link = renderMetaLink(codeInfo.label, codeInfo.url);
    link.classList.add("code-link");
    return link;
  }
  const span = document.createElement("span");
  span.className = "code-link";
  span.textContent = codeInfo.label;
  return span;
}

function renderStageBadge(text) {
  const span = document.createElement("span");
  span.className = "stage-badge";
  span.textContent = text;
  return span;
}

function renderKeyMedia(paper) {
  if (!paper.key_image_url && !paper.key_formula) return null;

  const media = document.createElement("div");
  media.className = "key-media";

  if (paper.key_image_url && !isPdfUrl(paper.key_image_url)) {
    const figure = document.createElement("figure");
    figure.className = "key-figure";

    const image = document.createElement("img");
    image.src = paper.key_image_url;
    image.alt = paper.key_image_alt || `Key image from ${paper.journal}`;
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => {
      figure.hidden = true;
    });

    const caption = document.createElement("figcaption");
    caption.textContent = paper.key_image_alt || "Key image from the official article page";

    figure.append(image, caption);
    media.appendChild(figure);
  }

  if (paper.key_formula) {
    const formula = document.createElement("div");
    formula.className = "key-formula";
    const label = document.createElement("span");
    label.className = "key-formula-label";
    label.textContent = "Key formula";
    const code = document.createElement("code");
    code.textContent = paper.key_formula;
    formula.append(label, code);
    media.appendChild(formula);
  }

  return media;
}

function doiUrl(doi) {
  const normalized = String(doi || "")
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:/i, "");
  return `https://doi.org/${normalized}`;
}

function getFullTextUrl(paper) {
  const candidates = [
    paper.full_text_url,
    paper.fullTextUrl,
    paper.html_url,
    paper.open_access_url,
    paper.pmc_url,
    paper.url,
  ].filter(Boolean);
  const url = candidates.find((candidate) => !isPdfUrl(candidate));
  return url || "";
}

function isPdfUrl(url) {
  return /\.pdf($|[?#])/i.test(String(url));
}

function getCodeInfo(paper) {
  const explicitUrl = [
    paper.code_url,
    paper.codeUrl,
    paper.repository_url,
    paper.repository,
    paper.software_url,
  ].find(Boolean);
  if (explicitUrl && !isPdfUrl(explicitUrl)) {
    return { label: "Code available", url: explicitUrl };
  }

  const text = [
    paper.title,
    paper.abstract,
    ...(paper.keywords || []),
  ]
    .filter(Boolean)
    .join(" ");
  const urlMatch = text.match(CODE_URL_PATTERN);
  if (urlMatch) {
    return { label: "Code available", url: urlMatch[1] };
  }
  const lower = text.toLowerCase();
  if (CODE_CUES.some((cue) => lower.includes(cue))) {
    return { label: "Code availability noted" };
  }
  return null;
}

function isSpeechOrHearingRelated(paper) {
  const tags = paper.tags || [];
  if (tags.some((tag) => RELEVANT_TAGS.has(tag))) return true;
  const text = [
    paper.title,
    paper.abstract,
    paper.section,
    ...(paper.keywords || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return RELEVANT_TERMS.some((term) => text.includes(term));
}

function renderAbstract(text) {
  const wrapper = document.createElement("div");
  wrapper.className = "abstract";
  splitParagraphs(text).forEach((paragraph) => {
    const paragraphElement = document.createElement("p");
    appendHighlightedParagraph(paragraphElement, paragraph);
    wrapper.appendChild(paragraphElement);
  });
  return wrapper;
}

function splitParagraphs(text) {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function appendHighlightedParagraph(element, paragraph) {
  const sentences = splitSentencesSafe(paragraph);
  const conclusionIndexes = findConclusionSentenceIndexes(sentences);
  sentences.forEach((sentence, index) => {
    if (index > 0) element.appendChild(document.createTextNode(" "));
    if (conclusionIndexes.has(index)) {
      const strong = document.createElement("strong");
      strong.textContent = sentence;
      markTranslatable(strong, sentence);
      element.appendChild(strong);
    } else {
      const span = document.createElement("span");
      span.textContent = sentence;
      markTranslatable(span, sentence);
      element.appendChild(span);
    }
  });
}

function splitSentencesSafe(text) {
  const matches = text.match(/[^.!?\u3002\uff01\uff1f]+[.!?\u3002\uff01\uff1f]?/g);
  return matches ? matches.map((sentence) => sentence.trim()).filter(Boolean) : [text];
}

function findConclusionSentenceIndexes(sentences) {
  const indexes = new Set();
  sentences.forEach((sentence, index) => {
    const lower = sentence.toLowerCase();
    if (CONCLUSION_CUES.some((cue) => lower.includes(cue))) {
      indexes.add(index);
    }
  });
  if (!indexes.size && sentences.length > 1) {
    indexes.add(sentences.length - 1);
  }
  return indexes;
}

function displayTitle(paper) {
  return paper.title;
}

function renderTranslatedTitle(paper) {
  const targetLanguage = state.targetLanguage;
  if (targetLanguage === "original") return null;

  const translated = state.translatedTitles.get(paperTitleKey(paper));
  const line = document.createElement("p");
  line.className = "translated-title";
  line.lang = targetLanguage;
  line.textContent = translated || `Translating title to ${languageLabel(targetLanguage)}...`;
  return line;
}

function displayAbstract(paper) {
  return paper.abstract || "";
}

function markTranslatable(element, text) {
  element.classList.add("translatable-text");
  element.dataset.sourceText = text;
}

async function translateRenderedPapers() {
  if (!els.translationStatus) return;
  const targetLanguage = state.targetLanguage;
  const runId = Date.now().toString();
  state.translationRunId = runId;
  document.documentElement.lang = "en";
  document.documentElement.dataset.translateTarget = targetLanguage;

  if (targetLanguage === "original") {
    els.translationStatus.textContent = "Original English";
    return;
  }

  const label = languageLabel(targetLanguage);
  if (!("Translator" in self)) {
    els.translationStatus.textContent = `Use browser page translation for ${label}`;
    return;
  }

  const nodes = [...document.querySelectorAll(".translatable-text")];
  if (!nodes.length) {
    els.translationStatus.textContent = `No visible text to translate`;
    return;
  }

  els.translationStatus.textContent = `Preparing ${label} translation...`;

  try {
    const availability = await Translator.availability({
      sourceLanguage: "en",
      targetLanguage,
    });
    if (availability === "unavailable") {
      els.translationStatus.textContent = `Browser translation unavailable for ${label}`;
      return;
    }

    const translator = await Translator.create({
      sourceLanguage: "en",
      targetLanguage,
      monitor(monitor) {
        monitor.addEventListener("downloadprogress", (event) => {
          if (state.translationRunId === runId) {
            els.translationStatus.textContent = `Downloading ${label} language pack ${Math.round(event.loaded * 100)}%`;
          }
        });
      },
    });

    for (const node of nodes) {
      if (state.translationRunId !== runId) return;
      const source = node.dataset.sourceText;
      if (source) {
        node.textContent = await translator.translate(source);
      }
    }
    els.translationStatus.textContent = `Translated to ${label} with browser Translator`;
  } catch (error) {
    els.translationStatus.textContent = `Use browser page translation for ${label}`;
  }
}

async function translateVisibleTitles(papers) {
  const targetLanguage = state.targetLanguage;
  if (targetLanguage === "original") return;
  if (!("Translator" in self)) return;
  const missing = papers
    .filter((paper) => paper.title && !state.translatedTitles.has(paperTitleKey(paper)))
    .slice(0, 40);
  if (!missing.length || state.titleTranslationStatus === "running") return;

  state.titleTranslationStatus = "running";
  try {
    const availability = await Translator.availability({
      sourceLanguage: "en",
      targetLanguage,
    });
    if (availability === "unavailable") return;

    const translator = await Translator.create({
      sourceLanguage: "en",
      targetLanguage,
    });
    for (const paper of missing) {
      state.translatedTitles.set(paperTitleKey(paper), await translator.translate(paper.title));
    }
  } catch (error) {
    return;
  } finally {
    state.titleTranslationStatus = "idle";
  }
  render();
}

function paperTitleKey(paper) {
  return paper.doi || `${paper.journal}|${paper.publication_date}|${paper.title}`;
}

function languageLabel(value) {
  const option = LANGUAGE_OPTIONS.find(([code]) => code === value);
  return option ? option[1] : value;
}

function isPriority(paper) {
  return (paper.tags || []).includes("priority section");
}

function isEarlyAccess(paper) {
  return paper.publication_stage === "early_access" || paper.is_early_access === true;
}

function isNonPriorityJasaPaper(paper) {
  return JASA_JOURNALS.has(paper.journal) && !isPriority(paper);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function withinDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.valueOf())) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return date >= cutoff;
}

function getPaperMonth(paper) {
  const dateString = paper.publication_date || "";
  return /^\d{4}-\d{2}/.test(dateString) ? dateString.slice(0, 7) : "";
}

function authorLine(authors = []) {
  if (!authors.length) return "";
  if (authors.length <= 3) return authors.join(", ");
  return `${authors.slice(0, 3).join(", ")} et al.`;
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.valueOf())) return dateString || "";
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(date);
}

function formatDateTime(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.valueOf())) return dateString;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatMonth(monthString) {
  const date = new Date(`${monthString}-01T00:00:00`);
  if (Number.isNaN(date.valueOf())) return monthString;
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long" }).format(date);
}
