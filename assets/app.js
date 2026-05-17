import { BUNNY_QUOTES } from "./bunny_quotes.js";

const state = {
  papers: [],
  generatedAt: "",
  targetLanguage: "original",
  translatedTitles: new Map(),
  titleTranslationStatus: "idle",
  paperListLimit: 18,
  paperListObserver: null,
  filters: {
    query: "",
    journal: "",
    section: "",
    tag: "",
    month: "",
    showOtherJasaSections: false,
  },
};

const EARLY_ACCESS_MONTH = "__early_access";
const CURRENT_UPDATE_FILTER = "__current_update";
const HIGH_IMPACT_LABEL = "High-impact Journals";
const CURRENT_UPDATE_WINDOW_MS = 4 * 60 * 60 * 1000;
const INITIAL_PAPER_LIST_LIMIT = 18;
const PAPER_LIST_BATCH_SIZE = 12;

const NON_RESEARCH_TITLE_PATTERNS = [
  /^editorial board\b/i,
  /^erratum\b/i,
  /^corrigendum\b/i,
  /^correction\b/i,
  /^publisher correction\b/i,
  /^reviews of acoustical patents\b/i,
];

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

const RTL_LANGUAGES = new Set(["ar", "fa", "he", "ur"]);

const JOURNAL_STYLES = {
  "The Journal of the Acoustical Society of America": { color: "#0b6f72", background: "#eef8f7", logo: "JASA", sublogo: "ASA" },
  "JASA Express Letters": { color: "#7c3aed", background: "#f3edff", logo: "JASA", sublogo: "EL" },
  "Trends in Hearing": { color: "#d97706", background: "#fff7e8", logo: "TiH", sublogo: "SAGE" },
  "Journal of the Association for Research in Otolaryngology": { color: "#2563eb", background: "#edf4ff", logo: "JARO", sublogo: "ARO" },
  "Ear and Hearing": { color: "#c026d3", background: "#fdf0ff", logo: "E&H", sublogo: "AAS" },
  "Hearing Research": { color: "#15803d", background: "#effaf2", logo: "HR", sublogo: "ELS" },
  "High-impact Journals": { color: "#b45309", background: "#fff7ed", logo: "HI", sublogo: "JOURNALS" },
};

const SOURCE_FILTER_ORDER = [
  "The Journal of the Acoustical Society of America",
  "JASA Express Letters",
  "Trends in Hearing",
  "Journal of the Association for Research in Otolaryngology",
  "Ear and Hearing",
  "Hearing Research",
  HIGH_IMPACT_LABEL,
];

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

const JASA_SECTION_HIGHLIGHTS = new Set([
  "Speech Communication",
  "Psychological and Physiological Acoustics",
]);

const PUBLIC_TAG_LABELS = {
  "cochlear implant": "Cochlear Implants",
  "hearing aid": "Hearing Aids",
  "speech perception": "Speech Perception",
  psychoacoustics: "Psychoacoustics",
  "auditory physiology": "Auditory Physiology",
  "clinical audiology": "Clinical Audiology",
  "machine learning": "Machine Learning",
  "real-world listening": "Real-world Listening",
};

const TAG_INFERENCE_RULES = [
  { label: "Artificial Hearing", terms: ["artificial hearing", "electric hearing", "cochlear implant", "auditory prosthesis", "auditory prostheses"] },
  { label: "Hearing Healthcare AI", terms: ["hearing healthcare ai", "artificial intelligence", "deep learning", "machine learning", "neural network", "deep neural network", "large language model"] },
  { label: "Auditory Prostheses", terms: ["cochlear implant", "cochlear implants", "hearing aid", "hearing aids", "auditory prosthesis", "auditory prostheses"] },
  { label: "Binaural Hearing", terms: ["binaural", "bilateral", "spatial hearing", "interaural", "sound localization"] },
  { label: "Speech-in-Noise", terms: ["speech in noise", "speech-in-noise", "speech recognition in noise", "speech perception in noise", "speech intelligibility in noise"] },
  { label: "Objective Evaluation", terms: ["objective evaluation", "objective measure", "auditory brainstem response", "abr", "assr", "eeg", "mismatch negativity", "otoacoustic"] },
  { label: "Clinical relevance", terms: ["clinical", "patient", "diagnosis", "outcome", "rehabilitation", "audiology", "hearing loss", "tinnitus"] },
  { label: "Methodological relevance", terms: ["method", "measurement", "validation", "assessment", "protocol", "recording", "analysis"] },
  { label: "Technology-focused", terms: ["device", "technology", "algorithm", "software", "compressor", "hearing aid", "cochlear implant"] },
  { label: "Review-worthy", terms: ["review", "systematic review", "meta-analysis", "scoping review"] },
  { label: "Emerging topic", terms: ["emerging", "deep neural", "large language model", "artificial intelligence"] },
];

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

const TITLE_HIGHLIGHT_KEYWORDS = [
  "cochlear implant",
  "cochlear implants",
  "hearing aid",
  "hearing aids",
  "hearing loss",
  "deafness",
  "tinnitus",
  "hyperacusis",
  "speech recognition",
  "speech perception",
  "speech intelligibility",
  "speech-in-noise",
  "listening effort",
  "sound quality",
  "auditory brainstem response",
  "auditory nerve",
  "auditory cortex",
  "gene therapy",
  "deep neural network",
  "deep learning",
  "machine learning",
  "artificial intelligence",
  "digital therapeutic",
  "noise reduction",
  "older adults",
  "children",
  "pediatric",
];

const els = {
  papers: document.querySelector("#papers"),
  empty: document.querySelector("#emptyState"),
  search: document.querySelector("#searchInput"),
  journal: document.querySelector("#journalFilter"),
  section: document.querySelector("#sectionFilter"),
  tag: document.querySelector("#tagFilter"),
  month: document.querySelector("#monthFilter"),
  showOtherJasaSections: document.querySelector("#showOtherJasaSections"),
  paperCount: document.querySelector("#paperCount"),
  generatedAt: document.querySelector("#generatedAt"),
  sourceInfoToggle: document.querySelector("#sourceInfoToggle"),
  sourceInfoDialog: document.querySelector("#sourceInfoDialog"),
  sourceInfoClose: document.querySelector("#sourceInfoClose"),
  hearingBunny: document.querySelector("#hearingBunny"),
  translationStatus: null,
  newThisUpdate: document.querySelector("#newThisUpdate"),
  sectionHighlights: document.querySelector("#sectionHighlights"),
  trendingTopics: document.querySelector("#trendingTopics"),
  selectedRecentPapers: document.querySelector("#selectedRecentPapers"),
  featuredFigurePanel: document.querySelector("#featuredFigurePanel"),
  featuredFigure: document.querySelector("#featuredFigure"),
  weeklyDigestWindow: document.querySelector("#weeklyDigestWindow"),
  weeklyTotal: document.querySelector("#weeklyTotal"),
  weeklyJournalCounts: document.querySelector("#weeklyJournalCounts"),
  weeklyTopicCounts: document.querySelector("#weeklyTopicCounts"),
  weeklyTopTopics: document.querySelector("#weeklyTopTopics"),
  weeklySelectedPapers: document.querySelector("#weeklySelectedPapers"),
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
  startBunnyMotions();
  render();
}

async function loadData() {
  try {
    const response = await fetch(`data/papers.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    state.papers = payload.papers || [];
    state.generatedAt = payload.generated_at || "";
    state.translatedTitles.clear();
    state.titleTranslationStatus = "idle";
    setTranslatableText(els.generatedAt, payload.generated_at ? `Updated ${formatDateTime(payload.generated_at)}` : "Not yet updated");
  } catch (error) {
    setTranslatableText(els.generatedAt, "No data file found");
    state.papers = [];
    state.generatedAt = "";
  }
}

function addLanguageControl() {
  const controls = document.querySelector(".status");
  if (!controls) return;
  const label = document.createElement("label");
  label.className = "browser-translate header-language";
  label.innerHTML = `
    <span>Language</span>
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
  markTranslatablePlaceholder(els.search, "Title or author...");
}

function bindFilters() {
  els.search.addEventListener("input", () => {
    state.filters.query = els.search.value.trim().toLowerCase();
    resetPaperListLimit();
    render();
  });
  els.journal.addEventListener("change", () => {
    state.filters.journal = els.journal.value;
    resetPaperListLimit();
    render();
  });
  els.section.addEventListener("change", () => {
    state.filters.section = els.section.value;
    resetPaperListLimit();
    render();
  });
  els.tag.addEventListener("change", () => {
    state.filters.tag = els.tag.value;
    resetPaperListLimit();
    render();
  });
  els.month.addEventListener("change", () => {
    state.filters.month = els.month.value;
    resetPaperListLimit();
    render();
  });
  els.showOtherJasaSections.addEventListener("change", () => {
    state.filters.showOtherJasaSections = els.showOtherJasaSections.checked;
    resetPaperListLimit();
    render();
  });
  els.language?.addEventListener("change", () => {
    state.targetLanguage = els.language.value;
    state.translatedTitles.clear();
    state.titleTranslationStatus = "idle";
    render();
  });
  els.sourceInfoToggle?.addEventListener("click", () => {
    if (els.sourceInfoDialog?.showModal) {
      els.sourceInfoDialog.showModal();
    }
  });
  els.sourceInfoClose?.addEventListener("click", () => {
    els.sourceInfoDialog?.close();
  });
  els.sourceInfoDialog?.addEventListener("click", (event) => {
    const panel = els.sourceInfoDialog.querySelector(".source-info-panel");
    if (panel && !panel.contains(event.target)) {
      els.sourceInfoDialog.close();
    }
  });
}

function resetPaperListLimit() {
  state.paperListLimit = INITIAL_PAPER_LIST_LIMIT;
}

function startBunnyMotions() {
  if (!els.hearingBunny) return;
  enableBunnyDrag();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const actions = ["bunny-hop", "bunny-call", "bunny-wink", "bunny-wiggle"];
  const callouts = ["boop!", "hop!", "listen!", "peek!"];
  let lastAction = "";

  const runAction = () => {
    const movedToAbstract = moveBunnyToNextAbstract();
    const options = actions.filter((action) => action !== lastAction);
    const action = movedToAbstract ? "bunny-hop" : options[Math.floor(Math.random() * options.length)];
    lastAction = action;
    els.hearingBunny.classList.remove(...actions);
    if (action === "bunny-call") {
      const callout = els.hearingBunny.querySelector(".bunny-callout");
      if (callout) callout.textContent = callouts[Math.floor(Math.random() * callouts.length)];
    }
    requestAnimationFrame(() => els.hearingBunny.classList.add(action));
    window.setTimeout(() => els.hearingBunny.classList.remove(action), 1300);
  };

  window.setTimeout(runAction, 1200);
  window.setInterval(runAction, 6200);
  window.addEventListener("scroll", () => queueBunnyMove(), { passive: true });
  window.addEventListener("resize", () => {
    keepDraggedBunnyInView();
    queueBunnyMove();
  });
}

function queueBunnyMove() {
  if (!els.hearingBunny) return;
  if (state.bunnyManualPosition) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  window.clearTimeout(state.bunnyMoveTimer);
  state.bunnyMoveTimer = window.setTimeout(() => moveBunnyToNextAbstract(), 220);
}

function moveBunnyToNextAbstract() {
  if (state.bunnyManualPosition) return false;
  if (!els.hearingBunny || window.innerWidth < 980) {
    parkBunny();
    return false;
  }

  const abstracts = [...document.querySelectorAll(".paper.has-abstract .abstract")].filter(isVisibleAbstract);
  if (!abstracts.length) {
    parkBunny();
    return false;
  }

  state.bunnyTargetIndex = ((state.bunnyTargetIndex ?? -1) + 1) % abstracts.length;
  const abstract = abstracts[state.bunnyTargetIndex];
  const paper = abstract.closest(".paper");
  if (!paper) return false;

  const bunnyWidth = els.hearingBunny.offsetWidth || 112;
  const bunnyHeight = els.hearingBunny.offsetHeight || 128;
  const paperRect = paper.getBoundingClientRect();
  const abstractRect = abstract.getBoundingClientRect();
  const gap = 12;
  let left = null;
  if (paperRect.right + gap + bunnyWidth <= window.innerWidth - 8) {
    left = paperRect.right + gap;
  } else if (paperRect.left - gap - bunnyWidth >= 8) {
    left = paperRect.left - gap - bunnyWidth;
  }
  if (left === null) {
    parkBunny();
    return false;
  }
  const top = clamp(abstractRect.top - 8, 8, window.innerHeight - bunnyHeight - 8);

  els.hearingBunny.style.setProperty("--bunny-left", `${Math.round(left)}px`);
  els.hearingBunny.style.setProperty("--bunny-top", `${Math.round(top)}px`);
  els.hearingBunny.classList.add("bunny-following-abstract");
  return true;
}

function parkBunny() {
  els.hearingBunny?.classList.remove("bunny-following-abstract");
}

function enableBunnyDrag() {
  els.hearingBunny.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.preventDefault();
    const rect = els.hearingBunny.getBoundingClientRect();
    state.bunnyDragging = {
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false,
    };
    els.hearingBunny.setPointerCapture(event.pointerId);
    els.hearingBunny.classList.add("bunny-following-abstract", "bunny-dragging");
    setBunnyPosition(rect.left, rect.top);
  });

  els.hearingBunny.addEventListener("pointermove", (event) => {
    if (!state.bunnyDragging) return;
    if (Math.abs(event.clientX - state.bunnyDragging.startX) > 5 || Math.abs(event.clientY - state.bunnyDragging.startY) > 5) {
      state.bunnyDragging.moved = true;
      state.bunnyManualPosition = true;
    }
    const bunnyWidth = els.hearingBunny.offsetWidth || 112;
    const bunnyHeight = els.hearingBunny.offsetHeight || 128;
    setBunnyPosition(
      clamp(event.clientX - state.bunnyDragging.offsetX, 8, window.innerWidth - bunnyWidth - 8),
      clamp(event.clientY - state.bunnyDragging.offsetY, 8, window.innerHeight - bunnyHeight - 8)
    );
  });

  const stopDragging = (event) => {
    if (!state.bunnyDragging) return;
    const wasClick = !state.bunnyDragging.moved;
    state.bunnyDragging = null;
    els.hearingBunny.releasePointerCapture?.(event.pointerId);
    els.hearingBunny.classList.remove("bunny-dragging");
    if (wasClick) showBunnyQuote();
  };
  els.hearingBunny.addEventListener("pointerup", stopDragging);
  els.hearingBunny.addEventListener("pointercancel", stopDragging);
  els.hearingBunny.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    showBunnyQuote();
  });
}

function setBunnyPosition(left, top) {
  els.hearingBunny.style.setProperty("--bunny-left", `${Math.round(left)}px`);
  els.hearingBunny.style.setProperty("--bunny-top", `${Math.round(top)}px`);
}

function keepDraggedBunnyInView() {
  if (!state.bunnyManualPosition || !els.hearingBunny) return;
  const rect = els.hearingBunny.getBoundingClientRect();
  const bunnyWidth = els.hearingBunny.offsetWidth || 112;
  const bunnyHeight = els.hearingBunny.offsetHeight || 128;
  setBunnyPosition(
    clamp(rect.left, 8, window.innerWidth - bunnyWidth - 8),
    clamp(rect.top, 8, window.innerHeight - bunnyHeight - 8)
  );
}

function showBunnyQuote() {
  const quote = els.hearingBunny.querySelector(".bunny-quote");
  if (!quote || !BUNNY_QUOTES.length) return;
  const effects = ["quote-aurora", "quote-sunburst", "quote-neon", "quote-candy", "quote-ocean", "quote-starlight"];
  quote.textContent = BUNNY_QUOTES[Math.floor(Math.random() * BUNNY_QUOTES.length)];
  quote.className = `bunny-quote ${effects[Math.floor(Math.random() * effects.length)]}`;
  els.hearingBunny.classList.remove("bunny-hop", "bunny-call", "bunny-wink", "bunny-wiggle");
  requestAnimationFrame(() => {
    quote.classList.add("quote-show");
    els.hearingBunny.classList.add("bunny-wink");
  });
  window.clearTimeout(state.bunnyQuoteTimer);
  state.bunnyQuoteTimer = window.setTimeout(() => {
    quote.classList.remove("quote-show");
    els.hearingBunny.classList.remove("bunny-wink");
  }, 6200);
}

function isVisibleAbstract(element) {
  const rect = element.getBoundingClientRect();
  return rect.bottom > 100 && rect.top < window.innerHeight - 100;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function populateFilters() {
  const papers = dashboardPapers();
  fillSelect(els.journal, orderedSourceFilters(papers.map(sourceFilterValue)));
  fillSelect(els.section, unique(papers.map((paper) => paper.section).filter(Boolean)));
  fillTagSelect(papers);
  populateMonthFilter(papers);
}

function fillSelect(select, values) {
  const first = select.options[0];
  select.replaceChildren(first);
  markTranslatable(first, first.dataset.sourceText || first.textContent);
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function fillTagSelect(papers = state.papers) {
  const first = els.tag.options[0];
  els.tag.replaceChildren(first);
  markTranslatable(first, first.dataset.sourceText || first.textContent);
  unique(papers.flatMap(publicPaperTags)).forEach((label) => {
    const option = document.createElement("option");
    option.value = label;
    option.textContent = label;
    markTranslatable(option, label);
    els.tag.appendChild(option);
  });
}

function render() {
  try {
    const sourcePapers = dashboardPapers();
    const papers = sortedPapers(sourcePapers.filter(matchesFilters));
    const visiblePapers = papers.slice(0, Math.min(state.paperListLimit, papers.length));
    setTranslatableText(els.paperCount, `${papers.length} ${papers.length === 1 ? "paper" : "papers"}`);

    renderRecentOverview(sourcePapers);
    renderWeeklyDigest(sourcePapers);
    renderPaperList(visiblePapers, papers.length);
    els.empty.hidden = papers.length > 0;
    markStaticUiForTranslation();
    translateVisibleTitles(visiblePapers);
    translateRenderedPage();
    queueBunnyMove();
  } catch (e) {
    console.error("Render error:", e);
  }
}

function renderPaperList(visiblePapers, totalCount) {
  disconnectPaperListObserver();
  const nodes = visiblePapers.map(renderPaper);
  if (visiblePapers.length < totalCount) {
    nodes.push(renderPaperListSentinel(visiblePapers.length, totalCount));
  }
  els.papers.replaceChildren(...nodes);
  observePaperListSentinel();
}

function renderPaperListSentinel(visibleCount, totalCount) {
  const sentinel = document.createElement("div");
  sentinel.className = "paper-list-sentinel";
  sentinel.dataset.paperListSentinel = "true";
  sentinel.textContent = `Showing ${visibleCount} of ${totalCount}. Scroll to reveal more.`;
  markTranslatable(sentinel, sentinel.textContent);
  return sentinel;
}

function observePaperListSentinel() {
  const sentinel = els.papers.querySelector("[data-paper-list-sentinel='true']");
  if (!sentinel) return;
  if (!("IntersectionObserver" in window)) return;
  state.paperListObserver = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      state.paperListLimit += PAPER_LIST_BATCH_SIZE;
      disconnectPaperListObserver();
      render();
    },
    { rootMargin: "600px 0px" },
  );
  state.paperListObserver.observe(sentinel);
}

function disconnectPaperListObserver() {
  state.paperListObserver?.disconnect();
  state.paperListObserver = null;
}

function populateMonthFilter(papers = state.papers) {
  const months = unique(papers.map(getPaperMonth).filter(Boolean)).sort().reverse();
  const hasEarlyAccess = papers.some(isEarlyAccess);
  const hasCurrentUpdate = newPapersInCurrentUpdate(papers).length > 0;
  const options = ["", ...(hasCurrentUpdate ? [CURRENT_UPDATE_FILTER] : []), ...months, ...(hasEarlyAccess ? [EARLY_ACCESS_MONTH] : [])];
  els.month.replaceChildren();
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "All months";
  markTranslatable(allOption, "All months");
  els.month.appendChild(allOption);
  if (hasCurrentUpdate) {
    const updateOption = document.createElement("option");
    updateOption.value = CURRENT_UPDATE_FILTER;
    updateOption.textContent = "Newly added";
    markTranslatable(updateOption, "Newly added");
    els.month.appendChild(updateOption);
  }
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
    markTranslatable(option, "Early access");
    els.month.appendChild(option);
  }

  if (!state.filters.month || !options.includes(state.filters.month)) {
    const currentMonth = toDateString(currentLocalDate()).slice(0, 7);
    state.filters.month = months.includes(currentMonth) ? currentMonth : months[0] || "";
  }
  els.month.value = state.filters.month;
}

function matchesFilters(paper) {
  const hasSearchQuery = Boolean(state.filters.query);
  const queryText = [
    paper.title,
    paper.title_zh,
    paper.chinese_title,
    (paper.authors || []).join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (state.filters.query && !queryText.includes(state.filters.query)) return false;
  if (state.filters.journal && sourceFilterValue(paper) !== state.filters.journal) return false;
  if (state.filters.section && paper.section !== state.filters.section) return false;
  if (state.filters.tag && !publicPaperTags(paper).includes(state.filters.tag)) return false;
  if (!hasSearchQuery) {
    if (state.filters.month === CURRENT_UPDATE_FILTER && !isPaperInCurrentUpdate(paper)) return false;
    if (state.filters.month === EARLY_ACCESS_MONTH && !isEarlyAccess(paper)) return false;
    if (state.filters.month && ![CURRENT_UPDATE_FILTER, EARLY_ACCESS_MONTH].includes(state.filters.month) && getPaperMonth(paper) !== state.filters.month) return false;
  }
  if (!state.filters.showOtherJasaSections && isOtherJasaSectionPaper(paper)) return false;
  return true;
}

function renderPaper(paper) {
  const article = document.createElement("article");
  const related = isSpeechOrHearingRelated(paper);
  const jasaOffTopic = JASA_JOURNALS.has(paper.journal) && !related;
  const abstractText = displayAbstract(paper);
  article.className = [
    "paper",
    related ? "related-paper" : "",
    jasaOffTopic ? "jasa-offtopic" : "",
    isJasaSectionHighlight(paper) ? "section-highlight" : "",
    abstractText ? "has-abstract" : "",
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
  if (isManualAddedPaper(paper)) title.appendChild(renderManualPaperMarker());
  title.appendChild(link);
  heading.appendChild(title);

  const translatedTitle = renderTranslatedTitle(paper);
  if (translatedTitle) {
    heading.appendChild(translatedTitle);
  }

  const meta = document.createElement("div");
  meta.className = "meta";
  [
    sourceDisplayName(paper),
    displayDate(paper),
    authorLine(paper.authors),
    paper.first_author_affiliation,
  ]
    .filter(Boolean)
    .forEach((text) => {
      meta.appendChild(renderMetaText(text));
    });
  if (isEarlyAccess(paper)) {
    meta.appendChild(renderStageBadge("Early access"));
  }
  if (isOpenAccess(paper)) {
    meta.appendChild(renderOpenAccessBadge(paper));
  }
  if (hasPubMedFullText(paper)) {
    meta.appendChild(renderPubMedFullTextBadge(paper));
  }
  if (isHighImpactPaper(paper) && paper.match_level) {
    meta.appendChild(renderHighImpactMatchBadge(paper));
  }
  if (paper.doi) {
    meta.appendChild(renderMetaLink(`DOI`, doiUrl(paper.doi)));
  }

  const codeInfo = getCodeInfo(paper);
  if (codeInfo) {
    meta.appendChild(renderCodeLink(codeInfo));
  }

  meta.appendChild(renderCiteButton(paper));

  article.append(heading, meta);

  if (abstractText || paper.last_author_lab_url) {
    article.appendChild(renderAbstract(paper));
  }

  const aiAnalysis = renderAiAnalysis(paper);
  if (aiAnalysis) {
    article.appendChild(aiAnalysis);
  } else {
    const btn = createGenerateAnalysisButton(paper);
    if (btn) article.appendChild(btn);
  }

  const media = renderKeyMedia(paper);
  if (media) {
    article.appendChild(media);
  }

  const chips = document.createElement("div");
  chips.className = "chips";
  if (isHighImpactPaper(paper)) {
    const sourceChip = document.createElement("span");
    sourceChip.className = "chip source-chip";
    sourceChip.textContent = HIGH_IMPACT_LABEL;
    markTranslatable(sourceChip, HIGH_IMPACT_LABEL);
    chips.appendChild(sourceChip);
    if (paper.needs_review) {
      const reviewChip = document.createElement("span");
      reviewChip.className = "chip review-chip";
      reviewChip.textContent = "Needs review";
      markTranslatable(reviewChip, "Needs review");
      chips.appendChild(reviewChip);
    }
  }
  publicPaperTags(paper).forEach((tag) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = tag;
    markTranslatable(chip, tag);
    chips.appendChild(chip);
  });
  article.appendChild(chips);
  return article;
}

function renderRecentOverview(papers = state.papers) {
  const sorted = sortedPapers(papers);
  renderCompactPaperList(els.newThisUpdate, newPapersInCurrentUpdate(papers).slice(0, 5), {
    showAffiliation: true,
    highlightTitleKeywords: true,
    fullTitle: true,
    emptyText: "No newly added papers were recorded in this update.",
  });

  const highlights = sorted.filter(isJasaSectionHighlight).slice(0, 4);
  renderCompactPaperList(els.sectionHighlights, highlights, { showAuthors: true, showAffiliation: true });

  const recentWindow = papersInLatestWindow(papers, 30);
  const overviewSource = recentWindow.length >= 8 ? recentWindow : sorted.slice(0, 30);
  renderTopicList(els.trendingTopics, topTagCounts(overviewSource, 8));

  const selectedSource = papersInLatestWindow(papers, 7);
  renderCompactPaperList(els.selectedRecentPapers, selectRecentPapers(selectedSource, 5), {
    showAffiliation: true,
    highlightTitleKeywords: true,
    fullTitle: true,
  });
  renderFeaturedFigure(papers);
}

function renderFeaturedFigure(papers = state.papers) {
  if (!els.featuredFigurePanel || !els.featuredFigure) return;
  const paper = selectFeaturedFigurePaper(papers);
  els.featuredFigure.replaceChildren();
  els.featuredFigurePanel.hidden = !paper;
  if (!paper) return;

  const card = document.createElement("article");
  card.className = "featured-figure";

  const figure = document.createElement("figure");
  figure.className = "featured-figure-media";
  const image = document.createElement("img");
  image.src = paper.key_image_url;
  image.alt = paper.key_image_alt || `Key image from ${sourceDisplayName(paper)}`;
  image.loading = "lazy";
  image.referrerPolicy = "no-referrer";
  image.addEventListener("error", () => {
    els.featuredFigurePanel.hidden = true;
  });
  figure.appendChild(image);
  if (paper.key_image_alt) {
    const caption = document.createElement("figcaption");
    caption.textContent = shortText(paper.key_image_alt, 150);
    markTranslatable(caption, caption.textContent);
    figure.appendChild(caption);
  }

  const body = document.createElement("div");
  body.className = "featured-figure-body";
  const link = document.createElement("a");
  link.className = "featured-figure-title";
  link.href = paper.url || (paper.doi ? doiUrl(paper.doi) : "#");
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = paper.title;
  markTranslatable(link, paper.title);

  const meta = document.createElement("p");
  meta.className = "compact-meta";
  [sourceDisplayName(paper), displayDate(paper)]
    .filter(Boolean)
    .forEach((part, index) => {
      if (index > 0) meta.appendChild(document.createTextNode(" · "));
      meta.appendChild(document.createTextNode(part));
    });
  const sourceUrl = paper.doi ? doiUrl(paper.doi) : paper.url;
  if (sourceUrl) {
    if (meta.childNodes.length) meta.appendChild(document.createTextNode(" / "));
    const source = document.createElement("a");
    source.className = "compact-source-link";
    source.href = sourceUrl;
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    source.textContent = paper.doi ? "DOI" : "Publisher";
    if (paper.doi) source.title = paper.doi;
    meta.appendChild(source);
  }
  if (isOpenAccess(paper)) {
    if (meta.childNodes.length) meta.appendChild(document.createTextNode(" / "));
    meta.appendChild(renderOpenAccessBadge(paper));
  }
  if (hasPubMedFullText(paper)) {
    if (meta.childNodes.length) meta.appendChild(document.createTextNode(" / "));
    meta.appendChild(renderPubMedFullTextBadge(paper));
  }

  body.append(link, meta);
  const tags = publicPaperTags(paper).slice(0, 3);
  if (tags.length) {
    const tagLine = document.createElement("div");
    tagLine.className = "mini-tags";
    tags.forEach((tag) => {
      const chip = document.createElement("span");
      chip.textContent = tag;
      markTranslatable(chip, tag);
      tagLine.appendChild(chip);
    });
    body.appendChild(tagLine);
  }

  card.append(figure, body);
  els.featuredFigure.appendChild(card);
}

function renderWeeklyDigest(papers = state.papers) {
  const weekly = papersInLatestWindow(papers, 7);
  const sortedWeekly = sortedPapers(weekly);
  const latestDate = maxPaperDate(papers);
  const startDate = latestDate ? addDays(latestDate, -6) : null;

  if (els.weeklyDigestWindow) els.weeklyDigestWindow.textContent = startDate && latestDate ? `${formatDate(toDateString(startDate))} - ${formatDate(toDateString(latestDate))}` : "No dated papers available";
  if (els.weeklyTotal) els.weeklyTotal.textContent = String(sortedWeekly.length);
  if (els.weeklyJournalCounts) {
    const topicCounts = topTagCounts(sortedWeekly, 10);
    renderCountList(els.weeklyJournalCounts, countValues(sortedWeekly.map((paper) => paper.journal)).slice(0, 8));
    renderCountList(els.weeklyTopicCounts, topicCounts);
    renderTopicList(els.weeklyTopTopics, topicCounts.slice(0, 5));
  }
}

function renderCompactPaperList(container, papers, options = {}) {
  container.replaceChildren();
  if (!papers.length) {
    const empty = document.createElement("p");
    empty.className = "panel-empty";
    setTranslatableText(empty, options.emptyText || "No papers available for this view.");
    container.appendChild(empty);
    return;
  }

  const list = document.createElement("ul");
  if (options.featureFirst) list.classList.add("is-featured-list");
  papers.forEach((paper, index) => {
    const item = document.createElement("li");
    if (options.featureFirst && index === 0) item.className = "compact-feature";
    if (options.fullTitle) item.classList.add("compact-full-title");
    const link = document.createElement("a");
    link.href = paper.url || (paper.doi ? doiUrl(paper.doi) : "#");
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    if (options.highlightTitleKeywords) {
      renderHighlightedTitle(link, paper.title || "");
    } else {
      link.appendChild(document.createTextNode(paper.title || ""));
    }
    markTranslatable(link, paper.title);
    if (isManualAddedPaper(paper)) {
      const titleRow = document.createElement("div");
      titleRow.className = "compact-title-row";
      titleRow.append(renderManualPaperMarker(), link);
      item.appendChild(titleRow);
    } else {
      item.appendChild(link);
    }

    if (options.showChineseTitle && paper.title_zh) {
      const chineseTitle = document.createElement("p");
      chineseTitle.className = "compact-translation";
      chineseTitle.textContent = paper.title_zh;
      item.appendChild(chineseTitle);
    }

    const meta = document.createElement("p");
    meta.className = "compact-meta";
    [
      sourceDisplayName(paper),
      displayDate(paper),
      options.showSection ? paper.section : null,
    ]
      .filter(Boolean)
      .forEach((part, index) => {
        if (index > 0) meta.appendChild(document.createTextNode(" · "));
        meta.appendChild(document.createTextNode(part));
      });
    const sourceUrl = paper.doi ? doiUrl(paper.doi) : paper.url;
    if (sourceUrl) {
      if (meta.childNodes.length) meta.appendChild(document.createTextNode(" / "));
      const source = document.createElement("a");
      source.className = "compact-source-link";
      source.href = sourceUrl;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      source.textContent = paper.doi ? "DOI" : "Publisher";
      if (paper.doi) source.title = paper.doi;
      meta.appendChild(source);
    }
    if (isOpenAccess(paper)) {
      if (meta.childNodes.length) meta.appendChild(document.createTextNode(" / "));
      meta.appendChild(renderOpenAccessBadge(paper));
    }
    if (hasPubMedFullText(paper)) {
      if (meta.childNodes.length) meta.appendChild(document.createTextNode(" / "));
      meta.appendChild(renderPubMedFullTextBadge(paper));
    }
    item.appendChild(meta);

    if (options.showAuthors) {
      const authors = compactAuthorLine(paper.authors);
      if (authors) {
        const authorsLine = document.createElement("p");
        authorsLine.className = "compact-authors";
        authorsLine.textContent = authors;
        item.appendChild(authorsLine);
      }
    }

    if (options.showAffiliation && paper.first_author_affiliation) {
      const affiliation = document.createElement("p");
      affiliation.className = "compact-affiliation";
      affiliation.textContent = shortText(paper.first_author_affiliation, 120);
      item.appendChild(affiliation);
    }

    if (options.showTags) {
      const tags = publicPaperTags(paper).slice(0, 4);
      if (tags.length) {
        const tagLine = document.createElement("div");
        tagLine.className = "mini-tags";
        tags.forEach((tag) => {
          const chip = document.createElement("span");
          chip.textContent = tag;
          markTranslatable(chip, tag);
          tagLine.appendChild(chip);
        });
        item.appendChild(tagLine);
      }
    }

    list.appendChild(item);
  });
  container.appendChild(list);
}

function renderHighlightedTitle(element, title) {
  const matches = titleKeywordMatches(title);
  if (!matches.length) {
    element.appendChild(document.createTextNode(title));
    return;
  }
  let cursor = 0;
  matches.forEach((match) => {
    if (match.start > cursor) element.appendChild(document.createTextNode(title.slice(cursor, match.start)));
    const mark = document.createElement("mark");
    mark.className = keywordToneClass(match.term);
    mark.textContent = title.slice(match.start, match.end);
    element.appendChild(mark);
    cursor = match.end;
  });
  if (cursor < title.length) element.appendChild(document.createTextNode(title.slice(cursor)));
}

function titleKeywordMatches(title) {
  const lower = String(title || "").toLowerCase();
  const matches = [];
  TITLE_HIGHLIGHT_KEYWORDS.forEach((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^a-z0-9])(${escaped})(?=$|[^a-z0-9])`, "gi");
    let match;
    while ((match = pattern.exec(lower))) {
      const start = match.index + match[1].length;
      matches.push({ start, end: start + match[2].length, term });
    }
  });
  return matches
    .sort((left, right) => left.start - right.start || right.end - right.start - (left.end - left.start))
    .filter((match, index, all) => index === 0 || match.start >= all[index - 1].end);
}

function keywordToneClass(label) {
  const tones = ["tone-teal", "tone-blue", "tone-violet", "tone-rose", "tone-amber", "tone-emerald"];
  const index = [...String(label || "")].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % tones.length;
  return `title-keyword ${tones[index]}`;
}

function isManualAddedPaper(paper) {
  return paper.manual_added === true || String(paper.source || "").split("+").includes("manual");
}

function renderManualPaperMarker() {
  const marker = document.createElement("span");
  marker.className = "manual-paper-marker";
  marker.textContent = "Manual pick";
  marker.title = "Manually added paper";
  return marker;
}

function renderTopicList(container, counts) {
  container.replaceChildren();
  if (!counts.length) {
    const empty = document.createElement("p");
    empty.className = "panel-empty";
    setTranslatableText(empty, "No topics available for this period.");
    container.appendChild(empty);
    return;
  }
  counts.forEach(([label, count]) => {
    const topic = document.createElement("span");
    topic.className = "topic-pill";
    setTranslatableText(topic, `${label} ${count}`);
    container.appendChild(topic);
  });
}

function renderCountList(container, counts) {
  container.replaceChildren();
  if (!counts.length) {
    const empty = document.createElement("p");
    empty.className = "panel-empty";
    setTranslatableText(empty, "No counts available for this period.");
    container.appendChild(empty);
    return;
  }
  counts.forEach(([label, count]) => {
    const row = document.createElement("div");
    row.className = "count-row";
    const name = document.createElement("span");
    name.textContent = label;
    const value = document.createElement("strong");
    value.textContent = count;
    row.append(name, value);
    container.appendChild(row);
  });
}

function selectRecentPapers(papers, limit) {
  const byJournal = new Set();
  const scored = sortedPapers(papers)
    .map((paper) => ({ paper, score: paperRelevanceScore(paper) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || comparePaperDates(left.paper, right.paper));

  const selected = [];
  scored.forEach(({ paper }) => {
    if (selected.length >= limit) return;
    if (!byJournal.has(paper.journal) || selected.length >= Math.ceil(limit / 2)) {
      selected.push(paper);
      byJournal.add(paper.journal);
    }
  });

  if (selected.length < limit) {
    scored.forEach(({ paper }) => {
      if (selected.length >= limit) return;
      if (!selected.includes(paper)) selected.push(paper);
    });
  }

  return selected.slice(0, limit);
}

function selectFeaturedFigurePaper(papers) {
  const candidates = papers
    .filter((paper) => paper.key_image_url && !isPdfUrl(paper.key_image_url))
    .filter((paper) => !isOtherJasaSectionPaper(paper))
    .sort((left, right) => paperStableKey(left).localeCompare(paperStableKey(right)));
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function paperStableKey(paper) {
  return paper.doi || `${paper.journal}|${paper.publication_date}|${paper.title}`;
}

function paperRelevanceScore(paper) {
  const tags = publicPaperTags(paper);
  let score = tags.length;
  const textLower = [
    paper.title,
    ...(paper.keywords || []),
    ...(paper.tags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const priorityTerms = [
    "cochlear implant", "hearing aid", "audiometry", "speech perception",
    "signal processing", "fitting", "mapping", "encoding",
    "psychoacoustics", "auditory model", "neural encoding",
    "binaural", "sound localization", "speech coding",
    "auditory prosthesis", "cochlear implant", "hearing prosthesis",
    "otoneurophysiology", "auditory nerve", "compound action potential",
  ];
  const hasPriority = priorityTerms.some((term) => textLower.includes(term));
  if (hasPriority) score += 5;
  if (getAiAnalysis(paper)) score += 1;
  if (paper.abstract) score += 1;
  if (tags.some((tag) => ["Clinical Audiology", "Speech Perception", "Auditory Neuroscience", "Machine Learning", "Objective Evaluation"].includes(tag))) {
    score += 2;
  }
  return score;
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
  if (!text.startsWith("DOI:")) markTranslatable(link, text);
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
  markTranslatable(span, text);
  return span;
}

function renderOpenAccessBadge(paper) {
  const url = paper.open_access_url || getFullTextUrl(paper) || paper.url;
  const badge = url ? document.createElement("a") : document.createElement("span");
  badge.className = "oa-badge";
  if (url) {
    badge.href = url;
    badge.target = "_blank";
    badge.rel = "noopener noreferrer";
  }
  badge.textContent = "OA";
  badge.title = paper.license_url ? `Open access: ${paper.license_url}` : "Open access";
  return badge;
}

function renderPubMedFullTextBadge(paper) {
  const url = getPubMedFullTextUrl(paper);
  const badge = url ? document.createElement("a") : document.createElement("span");
  badge.className = "pubmed-fulltext-badge";
  if (url) {
    badge.href = url;
    badge.target = "_blank";
    badge.rel = "noopener noreferrer";
  }
  badge.textContent = "PubMed full text";
  badge.title = "Full text available via PubMed/PMC";
  return badge;
}

function renderHighImpactMatchBadge(paper) {
  const span = document.createElement("span");
  const needsReview = paper.needs_review === true;
  span.className = needsReview ? "match-badge needs-review" : "match-badge";
  span.textContent = needsReview ? "Needs review" : "Strict keyword match";
  const keywords = (paper.matched_keywords || []).join(", ");
  if (keywords) span.title = `Matched keywords: ${keywords}`;
  markTranslatable(span, span.textContent);
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
    markTranslatable(caption, caption.textContent);

    figure.append(image, caption);
    media.appendChild(figure);
  }

  if (paper.key_formula) {
    const formula = document.createElement("div");
    formula.className = "key-formula";
    const label = document.createElement("span");
    label.className = "key-formula-label";
    label.textContent = "Key formula";
    markTranslatable(label, "Key formula");
    const code = document.createElement("code");
    code.textContent = paper.key_formula;
    formula.append(label, code);
    media.appendChild(formula);
  }

  return media;
}

function renderAiAnalysis(paper) {
  const analysis = getAiAnalysis(paper);
  if (!analysis) return null;

  const wrapper = document.createElement("section");
  wrapper.className = "ai-analysis";
  wrapper.setAttribute("aria-label", "AI-generated abstract analysis");

  const title = document.createElement("h3");
  title.textContent = "AI-Generated Abstract Analysis";

  const list = document.createElement("dl");
  [
    ["Scientific question", analysis.scientific_question],
    ["Highlight", analysis.key_highlight],
    ["Limitation", analysis.main_limitation],
    ["Implication", analysis.research_implication],
  ].forEach(([label, value]) => {
    if (!value) return;
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = value;
    list.append(term, detail);
  });

  const footer = document.createElement("p");
  footer.className = "ai-analysis-footer";
  const model = analysis.model || "MiniMax-M2.7";
  footer.textContent = `Generated by ${model}`;

  wrapper.append(title, list, footer);
  return list.children.length ? wrapper : null;
}

function getAiAnalysis(paper) {
  const analysis = paper.ai_analysis || paper.analysis;
  if (!analysis) return null;
  const values = {
    scientific_question: analysis.scientific_question || analysis.scientificQuestion,
    key_highlight: analysis.key_highlight || analysis.keyHighlight || analysis.highlight,
    main_limitation: analysis.main_limitation || analysis.mainLimitation || analysis.limitation,
    research_implication: analysis.research_implication || analysis.researchImplication,
    model: analysis.model,
  };
  return Object.values(values).some(Boolean) ? values : null;
}

const CF_WORKER_URL = "https://hearing-paper-monitor.mengqinglin08.workers.dev";
const ENABLE_INLINE_AI_ANALYSIS = false;

async function generateAnalysis(paper) {
  const response = await fetch(CF_WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      paper: {
        title: paper.title,
        abstract: paper.abstract,
        journal: paper.journal,
        section: paper.section,
        keywords: paper.keywords || [],
        tags: paper.tags || [],
      },
      language: document.documentElement.lang || "en",
    }),
  });
  let result = null;
  try {
    result = await response.json();
  } catch {
    result = null;
  }
  if (!response.ok || result?.error) {
    throw new Error(result?.error || `Analysis failed: ${response.status}`);
  }
  return result;
}

function createGenerateAnalysisButton(paper) {
  if (!ENABLE_INLINE_AI_ANALYSIS) return null;
  if (!paper.abstract || paper.abstract.length < 120) return null;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "generate-analysis-btn";
  btn.textContent = "Generate AI Analysis";
  btn.disabled = false;

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Generating...";
    try {
      const result = await generateAnalysis(paper);
      paper.ai_analysis = {
        ...result,
        provider: "minimax",
        model: result.model || "MiniMax-M2.7",
        generated_at: new Date().toISOString(),
      };
      const card = btn.closest(".paper");
      if (card) {
        const existing = card.querySelector(".ai-analysis");
        if (existing) existing.remove();
        const aiSection = renderAiAnalysis(paper);
        if (aiSection) card.insertBefore(aiSection, btn);
      }
      btn.remove();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Retry AI Analysis";
      btn.title = err.message || "Analysis generation failed";
      console.error("Analysis generation failed:", err);
    }
  });

  return btn;
}

function analysisSearchTerms(paper) {
  const analysis = getAiAnalysis(paper);
  if (!analysis) return [];
  return [analysis.scientific_question, analysis.key_highlight, analysis.main_limitation].filter(Boolean);
}

function doiUrl(doi) {
  const normalized = String(doi || "")
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:/i, "");
  return `https://doi.org/${normalized}`;
}

const JOURNAL_ABBREV = {
  "The Journal of the Acoustical Society of America": "JASA",
  "JASA Express Letters": "JASA EL",
  "Journal of the Association for Research in Otolaryngology": "JARO",
  "Ear and Hearing": "Ear Hear",
  "Trends in Hearing": "Trends Hear",
  "Hearing Research": "Hear Res",
  "High-impact Journals": "High-impact Journals",
};

function journalDisplayName(journal) {
  return JOURNAL_ABBREV[journal] || journal;
}

function sourceDisplayName(paper) {
  return isHighImpactPaper(paper) ? paper.actual_journal || HIGH_IMPACT_LABEL : journalDisplayName(paper.journal);
}

function sourceFilterValue(paper) {
  return isHighImpactPaper(paper) ? HIGH_IMPACT_LABEL : paper.journal;
}

function isHighImpactPaper(paper) {
  return paper.source_group === "high_impact" || paper.journal === HIGH_IMPACT_LABEL;
}

function orderedSourceFilters(values) {
  const present = new Set(values.filter(Boolean));
  const extras = [...present].filter((value) => !SOURCE_FILTER_ORDER.includes(value)).sort((a, b) => a.localeCompare(b));
  return [...SOURCE_FILTER_ORDER, ...extras];
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

function isOpenAccess(paper) {
  return paper.open_access === true || paper.is_open_access === true || Boolean(paper.open_access_url);
}

function getPubMedFullTextUrl(paper) {
  if (paper.pubmed_full_text_url) return paper.pubmed_full_text_url;
  if (paper.open_access_source === "pubmed_pmc" && paper.open_access_url) return paper.open_access_url;
  if (paper.pmc_url) return paper.pmc_url;
  return "";
}

function hasPubMedFullText(paper) {
  return paper.pubmed_full_text_available === true || Boolean(getPubMedFullTextUrl(paper));
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

function isEarAndHearing(paper) {
  return paper.journal === "Ear and Hearing";
}

function parseStructuredAbstract(abstract) {
  const sectionNames = ["Objectives", "Design", "Results", "Conclusions"];
  const sectionPattern = /(Objectives?|Design|Results?|Conclusions?)\s*[:\.]\s*/gi;

  const parts = abstract.split(sectionPattern);
  const sections = [];

  let i = 1;
  while (i < parts.length - 1) {
    const header = parts[i].trim();
    const content = (parts[i + 1] || "").replace(/\n+/g, " ").trim();
    const matchedName = sectionNames.find(
      (n) => n.toLowerCase() === header.toLowerCase()
    );
    if (matchedName && content) {
      sections.push({ section: matchedName, content });
    }
    i += 2;
  }

  return sections;
}

function renderAbstract(paper) {
  const wrapper = document.createElement("div");
  wrapper.className = "abstract";
  const text = displayAbstract(paper);
  let renderedStructured = false;

  if (isEarAndHearing(paper)) {
    const sections = parseStructuredAbstract(text);
    if (sections.length >= 3) {
      wrapper.classList.add("structured-abstract");
      sections.forEach(({ section, content }) => {
        const sectionEl = document.createElement("div");
        sectionEl.className = "abstract-section";
        const heading = document.createElement("h4");
        heading.className = "abstract-section-title";
        heading.textContent = section;
        const contentEl = document.createElement("p");
        contentEl.className = "abstract-section-content";
        appendHighlightedParagraph(contentEl, content);
        sectionEl.append(heading, contentEl);
        wrapper.appendChild(sectionEl);
      });
      renderedStructured = true;
    }
  }

  if (!renderedStructured) {
    splitParagraphs(text).forEach((paragraph) => {
      const paragraphElement = document.createElement("p");
      appendHighlightedParagraph(paragraphElement, paragraph);
      wrapper.appendChild(paragraphElement);
    });
  }
  const labHomepage = renderLastAuthorLab(paper);
  if (labHomepage) wrapper.appendChild(labHomepage);
  return wrapper;
}

function renderLastAuthorLab(paper) {
  if (!paper.last_author_lab_url) return null;
  const wrapper = document.createElement("p");
  wrapper.className = "last-author-lab";

  const label = document.createElement("span");
  label.textContent = "Last-author lab: ";
  markTranslatable(label, "Last-author lab");

  const link = document.createElement("a");
  link.href = paper.last_author_lab_url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = paper.last_author_lab_name || "Lab homepage";
  if (paper.last_author_affiliation) link.title = paper.last_author_affiliation;

  wrapper.append(label, link);
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

function setTranslatableText(element, text) {
  element.textContent = text;
  markTranslatable(element, text, { updateSource: true });
}

function markTranslatable(element, text, options = {}) {
  if (!element || !text) return;
  element.classList.add("translatable-text");
  if (options.updateSource || !element.dataset.sourceText) {
    element.dataset.sourceText = text;
  }
  element.lang = "en";
}

function markTranslatablePlaceholder(element, text) {
  if (!element || !text) return;
  element.dataset.sourcePlaceholder = text;
}

function markStaticUiForTranslation() {
  document
    .querySelectorAll(
      [
        "h1",
        ".subtitle-text",
        ".controls label > span",
        ".source-info-dialog h2",
        ".source-info-dialog p",
        ".source-info-dialog li span",
        ".section-heading h2",
        ".overview-panel h3",
        ".panel-note",
        ".digest-panel h3",
        ".digest-total span:last-child",
        "#emptyState",
      ].join(", ")
    )
    .forEach((element) => markTranslatable(element, element.dataset.sourceText || element.textContent.trim()));
  document
    .querySelectorAll("#journalFilter option[value=''], #sectionFilter option[value=''], #tagFilter option")
    .forEach((option) => markTranslatable(option, option.dataset.sourceText || option.textContent.trim()));
  markTranslatablePlaceholder(els.search, "Title or author...");
}

function restoreOriginalPageText() {
  document.querySelectorAll(".translatable-text").forEach((node) => {
    const source = node.dataset.sourceText;
    if (source) node.textContent = source;
    node.lang = "en";
    node.dir = "";
  });
  document.querySelectorAll("[data-source-placeholder]").forEach((node) => {
    node.setAttribute("placeholder", node.dataset.sourcePlaceholder);
  });
}

function applySourceLanguageMode(targetLanguage) {
  document.documentElement.lang = "en";
  document.documentElement.dir = isRtlLanguage(targetLanguage) ? "rtl" : "ltr";
  document.documentElement.dataset.translateTarget = targetLanguage;
}

function applyTranslatedLanguageMode(targetLanguage) {
  document.documentElement.lang = targetLanguage;
  document.documentElement.dir = isRtlLanguage(targetLanguage) ? "rtl" : "ltr";
  document.documentElement.dataset.translateTarget = targetLanguage;
}

function isRtlLanguage(language) {
  return RTL_LANGUAGES.has(String(language || "").split("-")[0].toLowerCase());
}

async function translateRenderedPage() {
  if (!els.translationStatus) return;
  const targetLanguage = state.targetLanguage;
  const runId = Date.now().toString();
  state.translationRunId = runId;
  applySourceLanguageMode(targetLanguage);
  restoreOriginalPageText();

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
  const placeholderNodes = [...document.querySelectorAll("[data-source-placeholder]")];
  if (!nodes.length && !placeholderNodes.length) {
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
        node.lang = targetLanguage;
        node.dir = isRtlLanguage(targetLanguage) ? "rtl" : "ltr";
      }
    }
    for (const node of placeholderNodes) {
      if (state.translationRunId !== runId) return;
      const source = node.dataset.sourcePlaceholder;
      if (source) {
        node.setAttribute("placeholder", await translator.translate(source));
      }
    }
    applyTranslatedLanguageMode(targetLanguage);
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
  const base = paper.doi || `${paper.journal}|${paper.publication_date}|${paper.title}`;
  return `${state.targetLanguage}|${base}`;
}

function languageLabel(value) {
  const option = LANGUAGE_OPTIONS.find(([code]) => code === value);
  return option ? option[1] : value;
}

function publicPaperTags(paper) {
  const labels = new Set();
  (paper.tags || []).forEach((tag) => {
    const label = PUBLIC_TAG_LABELS[tag];
    if (label) labels.add(label);
  });

  const text = paperText(paper);
  TAG_INFERENCE_RULES.forEach((rule) => {
    if (rule.terms.some((term) => text.includes(term))) {
      labels.add(rule.label);
    }
  });

  if ((paper.tags || []).includes("auditory physiology")) {
    labels.add("Auditory Neuroscience");
  }
  return [...labels].sort((left, right) => left.localeCompare(right));
}

function dashboardPapers() {
  return state.papers.filter((paper) => !isNonResearchItem(paper));
}

function isNonResearchItem(paper) {
  const title = String(paper.title || "").trim();
  return NON_RESEARCH_TITLE_PATTERNS.some((pattern) => pattern.test(title));
}

function paperText(paper) {
  return [
    paper.title,
    paper.abstract,
    paper.section,
    ...(paper.keywords || []),
    ...(paper.tags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isJasaSectionHighlight(paper) {
  return JASA_JOURNALS.has(paper.journal) && JASA_SECTION_HIGHLIGHTS.has(paper.section);
}

function isEarlyAccess(paper) {
  return paper.publication_stage === "early_access" || paper.is_early_access === true;
}

function isOtherJasaSectionPaper(paper) {
  return JASA_JOURNALS.has(paper.journal) && !isJasaSectionHighlight(paper);
}

function sortedPapers(papers) {
  return [...papers].sort(comparePaperDates);
}

function comparePaperDates(left, right) {
  const leftDate = Date.parse(`${effectiveDate(left) || ""}T00:00:00`);
  const rightDate = Date.parse(`${effectiveDate(right) || ""}T00:00:00`);
  const safeLeft = Number.isNaN(leftDate) ? 0 : leftDate;
  const safeRight = Number.isNaN(rightDate) ? 0 : rightDate;
  if (safeRight !== safeLeft) return safeRight - safeLeft;
  return String(left.title || "").localeCompare(String(right.title || ""));
}

function papersInLatestWindow(papers, days) {
  const latest = maxPaperDate(papers);
  if (!latest) return [];
  const start = addDays(latest, -(days - 1));
  return papers.filter((paper) => {
    const date = parsePaperDate(effectiveDate(paper));
    return date && date >= start && date <= latest;
  });
}

function newPapersInCurrentUpdate(papers) {
  return sortedPapers(papers.filter(isPaperInCurrentUpdate));
}

function isPaperInCurrentUpdate(paper) {
  const generatedAt = parseDateTime(state.generatedAt);
  if (Number.isNaN(generatedAt)) return false;
  const firstSeenAt = parseDateTime(paper.first_seen_at);
  if (Number.isNaN(firstSeenAt)) return false;
  const start = generatedAt - CURRENT_UPDATE_WINDOW_MS;
  const end = generatedAt + 5 * 60 * 1000;
  return firstSeenAt >= start && firstSeenAt <= end;
}

function papersFromRecentPastThroughFuture(papers, daysBack) {
  const today = currentLocalDate();
  const start = addDays(today, -daysBack);
  return papers.filter((paper) => {
    const date = parsePaperDate(effectiveDate(paper));
    return date && date >= start;
  });
}

function maxPaperDate(papers) {
  const dates = papers.map((paper) => parsePaperDate(effectiveDate(paper))).filter(Boolean);
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function effectiveDate(paper) {
  if (shouldUseOnlineDate(paper)) {
    return paper.available_online_date;
  }
  return paper.publication_date;
}

function shouldUseOnlineDate(paper) {
  if (!paper.available_online_date) return false;
  return isEarlyAccess(paper) || isFutureDate(paper.publication_date) || datePrecision(paper) !== "day";
}

function datePrecision(paper) {
  return paper.publication_date_precision || paper.publicationDatePrecision || "day";
}

function parsePaperDate(dateString) {
  const date = new Date(`${dateString || ""}T00:00:00`);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function parseDateTime(dateString) {
  const text = String(dateString || "").trim();
  if (!text) return Number.NaN;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) {
    return Date.parse(`${text.replace(" ", "T")}Z`);
  }
  return Date.parse(text);
}

function currentLocalDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function isFutureDate(dateString) {
  const date = parsePaperDate(dateString);
  return Boolean(date && date > currentLocalDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function topTagCounts(papers, limit) {
  return countValues(papers.flatMap(publicPaperTags)).slice(0, limit);
}

function countValues(values) {
  const counts = new Map();
  values.filter(Boolean).forEach((value) => {
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
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
  let dateString = paper.publication_date || "";
  if (shouldUseOnlineDate(paper)) {
    dateString = paper.available_online_date;
  }
  return /^\d{4}-\d{2}/.test(dateString) ? dateString.slice(0, 7) : "";
}

function authorLine(authors = []) {
  if (!authors.length) return "";
  if (authors.length <= 3) return authors.join(", ");
  return `${authors.slice(0, 3).join(", ")} et al.`;
}

function compactAuthorLine(authors = []) {
  if (!authors.length) return "";
  if (authors.length <= 2) return authors.join(", ");
  return `${authors[0]}, ${authors[1]} et al.`;
}

function shortText(value, maxLength) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.valueOf())) return dateString || "";
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(date);
}

function displayDate(paper) {
  if (shouldUseOnlineDate(paper)) {
    return `${formatDate(paper.available_online_date)} (online)`;
  }
  if (datePrecision(paper) === "month" && /^\d{4}-\d{2}/.test(paper.publication_date || "")) {
    return formatMonth(paper.publication_date.slice(0, 7));
  }
  if (datePrecision(paper) === "year" && /^\d{4}/.test(paper.publication_date || "")) {
    return paper.publication_date.slice(0, 4);
  }
  return formatDate(paper.publication_date);
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

// Citation export functions

function generateRIS(paper) {
  const lines = ["TY  - JOUR"];
  if (paper.title) lines.push(`TI  - ${paper.title}`);
  if (paper.authors?.length) {
    paper.authors.forEach((author) => lines.push(`AU  - ${author}`));
  }
  if (paper.journal) lines.push(`JO  - ${paper.journal}`);
  if (paper.publication_date) {
    const year = paper.publication_date.slice(0, 4);
    if (year) lines.push(`PY  - ${year}`);
  }
  if (paper.volume) lines.push(`VL  - ${paper.volume}`);
  if (paper.issue) lines.push(`IS  - ${paper.issue}`);
  if (paper.pages) {
    const pageParts = paper.pages.split("-");
    if (pageParts.length >= 2) {
      lines.push(`SP  - ${pageParts[0]}`);
      lines.push(`EP  - ${pageParts[1]}`);
    } else {
      lines.push(`SP  - ${paper.pages}`);
    }
  }
  if (paper.doi) lines.push(`DO  - ${paper.doi}`);
  const url = paper.url || (paper.doi ? `https://doi.org/${paper.doi}` : null);
  if (url) lines.push(`UR  - ${url}`);
  if (paper.abstract) lines.push(`AB  - ${paper.abstract}`);
  lines.push("ER  -");
  return lines.join("\n");
}

function generateBibTeX(paper) {
  const fields = [];
  if (paper.title) fields.push(`  title = {${escapeBibTeX(paper.title)}}`);
  if (paper.authors?.length) {
    const authorStr = paper.authors.join(" and ");
    fields.push(`  author = {${escapeBibTeX(authorStr)}}`);
  }
  if (paper.journal) fields.push(`  journal = {${escapeBibTeX(paper.journal)}}`);
  if (paper.publication_date) {
    const year = paper.publication_date.slice(0, 4);
    if (year) fields.push(`  year = {${year}}`);
  }
  if (paper.volume) fields.push(`  volume = {${paper.volume}}`);
  if (paper.issue) fields.push(`  number = {${paper.issue}}`);
  if (paper.pages) fields.push(`  pages = {${paper.pages}}`);
  if (paper.doi) fields.push(`  doi = {${paper.doi}}`);
  const url = paper.url || (paper.doi ? `https://doi.org/${paper.doi}` : null);
  if (url) fields.push(`  url = {${url}}`);
  if (paper.abstract && !paper.ai_analysis?.abstract) {
    fields.push(`  abstract = {${escapeBibTeX(paper.abstract)}}`);
  }
  const key = generateCitationKey(paper);
  return `@article{${key},\n${fields.join(",\n")}\n}`;
}

function escapeBibTeX(text) {
  return String(text)
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

function generateCitationKey(paper) {
  const firstAuthor = paper.authors?.[0] || "";
  const surname = firstAuthor.split(/\s+/).pop() || "paper";
  const year = (paper.publication_date || "").slice(0, 4) || "2026";
  const shortTitle = (paper.title || "")
    .split(/\s+/)
    .slice(0, 3)
    .join("_")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase();
  return `${surname}${year}${shortTitle}`.replace(/[^a-zA-Z0-9]/g, "");
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function showCopyFeedback(message) {
  let feedback = document.querySelector(".cite-copy-feedback");
  if (!feedback) {
    feedback = document.createElement("div");
    feedback.className = "cite-copy-feedback";
    document.body.appendChild(feedback);
  }
  feedback.textContent = message;
  feedback.classList.add("show");
  setTimeout(() => feedback.classList.remove("show"), 1500);
}

function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
  return Promise.resolve();
}

function openCiteDropdown(button) {
  const dropdown = button.closest(".cite-dropdown");
  if (!dropdown) return;
  document.querySelectorAll(".cite-dropdown-menu.open").forEach((menu) => menu.classList.remove("open"));
  dropdown.querySelector(".cite-dropdown-menu")?.classList.add("open");
  const closeHandler = (e) => {
    if (!dropdown.contains(e.target)) {
      dropdown.querySelector(".cite-dropdown-menu")?.classList.remove("open");
      document.removeEventListener("click", closeHandler);
    }
  };
  setTimeout(() => document.addEventListener("click", closeHandler), 0);
}

function renderCiteButton(paper) {
  const wrapper = document.createElement("div");
  wrapper.className = "cite-dropdown";

  const button = document.createElement("button");
  button.className = "cite-button";
  button.type = "button";
  button.textContent = "Cite / Save";
  button.addEventListener("click", (e) => {
    e.stopPropagation();
    openCiteDropdown(button);
  });

  const menu = document.createElement("div");
  menu.className = "cite-dropdown-menu";

  const doi = paper.doi;
  const doiUrl = doi ? `https://doi.org/${doi}` : null;
  const url = paper.url || doiUrl;
  const bibtex = generateBibTeX(paper);
  const ris = generateRIS(paper);
  const key = generateCitationKey(paper);

  const items = [];

  items.push({ label: "Download RIS", action: () => downloadFile(ris, `${key}.ris`, "application/x-research-info-systems") });
  items.push({ label: "Download BibTeX", action: () => downloadFile(bibtex, `${key}.bib`, "application/x-bibtex") });

  if (doi) {
    items.push({ divider: true });
    items.push({ label: "Copy DOI", action: () => copyToClipboard(doi).then(() => showCopyFeedback("DOI copied")) });
    items.push({ label: "Copy DOI link", action: () => copyToClipboard(doiUrl).then(() => showCopyFeedback("DOI link copied")) });
  }

  if (url && url !== doiUrl) {
    items.push({ label: "Copy publisher link", action: () => copyToClipboard(url).then(() => showCopyFeedback("Publisher link copied")) });
  }

  items.forEach((item) => {
    if (item.divider) {
      const divider = document.createElement("div");
      divider.className = "divider";
      menu.appendChild(divider);
    } else {
      const menuItem = document.createElement("button");
      menuItem.type = "button";
      menuItem.textContent = item.label;
      menuItem.addEventListener("click", (e) => {
        e.stopPropagation();
        menu.classList.remove("open");
        item.action();
      });
      menu.appendChild(menuItem);
    }
  });

  wrapper.append(button, menu);
  return wrapper;
}

const MOCK_VISITOR_DATA = [
  { name: "Beijing", value: [116.4, 39.9, 85] },
  { name: "Shanghai", value: [121.5, 31.2, 62] },
  { name: "Guangzhou", value: [113.3, 23.1, 45] },
  { name: "Shenzhen", value: [114.1, 22.5, 38] },
  { name: "Hong Kong", value: [114.2, 22.3, 32] },
  { name: "Singapore", value: [103.8, 1.4, 28] },
  { name: "Tokyo", value: [139.7, 35.7, 41] },
  { name: "Seoul", value: [126.9, 37.5, 22] },
  { name: "London", value: [-0.1, 51.5, 35] },
  { name: "Paris", value: [2.3, 48.9, 24] },
  { name: "Berlin", value: [13.4, 52.5, 18] },
  { name: "Amsterdam", value: [4.9, 52.4, 15] },
  { name: "Zurich", value: [8.5, 47.4, 12] },
  { name: "Stockholm", value: [18.6, 59.3, 10] },
  { name: "Boston", value: [-71.1, 42.4, 28] },
  { name: "New York", value: [-74.0, 40.7, 38] },
  { name: "San Francisco", value: [-122.4, 37.8, 31] },
  { name: "Los Angeles", value: [-118.2, 34.1, 25] },
  { name: "Chicago", value: [-87.6, 41.9, 18] },
  { name: "Toronto", value: [-79.4, 43.7, 20] },
  { name: "Vancouver", value: [-123.1, 49.3, 14] },
  { name: "Sydney", value: [151.2, -33.9, 22] },
  { name: "Melbourne", value: [144.9, -37.8, 16] },
  { name: "Bangalore", value: [77.6, 12.9, 30] },
  { name: "Mumbai", value: [72.9, 19.1, 25] },
  { name: "Dubai", value: [55.3, 25.2, 20] },
  { name: "Istanbul", value: [28.9, 41.0, 15] },
  { name: "Cairo", value: [31.2, 30.1, 12] },
  { name: "Sao Paulo", value: [-46.6, -23.5, 24] },
  { name: "Mexico City", value: [-99.1, 19.4, 18] },
  { name: "Buenos Aires", value: [-58.4, -34.6, 14] },
  { name: "Lagos", value: [3.4, 6.5, 10] },
  { name: "Nairobi", value: [36.8, -1.3, 8] },
];

function renderVisitorMap() {
  const container = document.getElementById("visitorMap");
  if (!container || typeof echarts === "undefined") return;

  const chart = echarts.init(container);

  const option = {
    backgroundColor: "transparent",
    geo: {
      map: "world",
      roam: false,
      silent: true,
      itemStyle: {
        areaColor: "#e8ecea",
        borderColor: "transparent",
      },
      emphasis: {
        disabled: true,
      },
    },
    series: [
      {
        type: "effectScatter",
        coordinateSystem: "geo",
        data: MOCK_VISITOR_DATA.map((d) => ({
          name: d.name,
          value: d.value,
        })),
        symbolSize: function (val) {
          const size = Math.sqrt(val[2]) * 1.8;
          return Math.max(6, Math.min(28, size));
        },
        showEffectOn: "render",
        rippleEffect: {
          brushType: "stroke",
          scale: 2,
          period: 4,
        },
        itemStyle: {
          color: "rgba(11, 111, 114, 0.55)",
          shadowBlur: 10,
          shadowColor: "rgba(11, 111, 114, 0.3)",
        },
        emphasis: {
          scale: 1.3,
        },
      },
    ],
  };

  chart.setOption(option);

  const resizeObserver = new ResizeObserver(() => chart.resize());
  resizeObserver.observe(container);

  window.addEventListener("resize", () => chart.resize());
}
