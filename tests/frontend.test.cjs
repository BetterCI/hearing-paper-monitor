const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

process.env.TZ = "Asia/Shanghai";
const NOW = Date.parse("2026-10-04T10:00:00Z");
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [NOW])); }
  static now() { return NOW; }
}

function element() {
  return {
    value: "", textContent: "", dataset: {}, options: [], hidden: false,
    classList: { add() {}, remove() {} },
    replaceChildren(...nodes) { this.options = nodes; },
    appendChild(node) { this.options.push(node); },
    addEventListener() {}, setAttribute() {}, scrollIntoView() {},
  };
}

function app(papers = []) {
  const elements = new Map();
  const events = new Map();
  const timers = [];
  const document = {
    hidden: false,
    querySelector(selector) {
      if (!elements.has(selector)) {
        const node = element();
        if (["#journalFilter", "#sectionFilter", "#tagFilter"].includes(selector)) node.options.push(element());
        elements.set(selector, node);
      }
      return elements.get(selector);
    },
    querySelectorAll: () => [],
    createElement: () => element(),
    addEventListener: (event, callback) => events.set(event, callback),
  };
  const window = {
    setInterval: (callback, delay) => timers.push({ callback, delay }),
    addEventListener: (event, callback) => events.set(event, callback),
  };
  const context = vm.createContext({ console, Date: FixedDate, AbortSignal, document, window, papers });
  const source = fs.readFileSync(path.join(__dirname, "../assets/app.js"), "utf8")
    .replace(/^import .*;\r?\n/m, "").replace(/^init\(\);\r?\n/m, "");
  vm.runInContext(source + "\nstate.papers = papers; state.generatedAt = '2026-10-04T08:31:03Z';", context);
  return { context, elements, events, timers, run: (code) => vm.runInContext(code, context) };
}

const latePaper = {
  title: "Frequency, intensity, and reference dependence of scalp-recorded auditory evoked potentials in the common marmoset",
  doi: "10.1016/j.heares.2026.109827", journal: "Hearing Research",
  publication_date: "2026-09-29", available_online_date: "2026-09-29",
  first_seen_at: "2026-10-04T08:30:51Z", tags: [],
};
const jasaPaper = {
  title: "Acoustic analyses on German vowels in read speech, recited speech, and singing",
  doi: "10.1121/10.0046810", journal: "JASA Express Letters",
  publication_date: "2026-10-02", first_seen_at: "2026-10-03T08:14:10Z",
  section: null, abstract: "We compare vowels in read speech, recited speech, and singing.", tags: [],
};

test("late-arriving September paper appears in default list and new-paper panel", () => {
  const a = app([latePaper]);
  assert.equal(a.run("matchesFilters(state.papers[0])"), true);
  assert.equal(a.run("papersForNewlyAddedPanel(dashboardPapers()).length"), 1);
});

test("default list orders first collection time before publication date", () => {
  const a = app([latePaper, { ...latePaper, doi: "older-arrival", publication_date: "2026-10-02", first_seen_at: "2026-10-03T08:00:00Z" }]);
  assert.equal(a.run("papersForList(dashboardPapers())[0].doi"), latePaper.doi);
});

test("monthly view remains explicit and uses publication ordering", () => {
  const a = app([latePaper]);
  assert.equal(a.run("state.filters.month = '2026-10'; matchesFilters(state.papers[0])"), false);
  assert.equal(a.run("state.filters.month = '2026-09'; matchesFilters(state.papers[0])"), true);
});

test("hearing and speech JASA paper with missing section remains visible and highlighted", () => {
  const a = app([jasaPaper]);
  assert.equal(a.run("matchesFilters(state.papers[0])"), true);
  assert.equal(a.run("isJasaHearingOrSpeechPaper(state.papers[0])"), true);
});

test("title and DOI searches bypass month and implicit JASA exclusions", () => {
  const paper = { ...jasaPaper, title: "Acoustic emission mechanisms of bubble detachment and pinch-off", abstract: "Bubble detachment in a fluid.", publication_date: "2026-07-01" };
  const a = app([paper]);
  assert.equal(a.run("state.filters.month='2026-10'; matchesFilters(state.papers[0])"), false);
  assert.equal(a.run("state.filters.query=state.papers[0].title.toLowerCase(); matchesFilters(state.papers[0])"), true);
  assert.equal(a.run("state.filters.query=state.papers[0].doi; matchesFilters(state.papers[0])"), true);
  assert.equal(a.run("state.filters.journal='Hearing Research'; matchesFilters(state.papers[0])"), false);
});

test("misleading tag and word substrings do not make unrelated JASA papers visible", () => {
  const a = app([{ ...jasaPaper, title: "Shearing of an elastic beam", abstract: "An elastic fabrication technique.", tags: ["auditory physiology"] }]);
  assert.equal(a.run("matchesFilters(state.papers[0])"), false);
  assert.equal(a.run("state.filters.showOtherJasaSections=true; matchesFilters(state.papers[0])"), true);
});

test("new-paper window includes late arrivals and follows local calendar boundaries", () => {
  const a = app([
    latePaper,
    { ...latePaper, doi: "at-start", first_seen_at: "2026-09-27T16:00:00Z" },
    { ...latePaper, doi: "too-old", first_seen_at: "2026-09-27T15:59:59Z" },
    { ...latePaper, doi: "future", first_seen_at: "2026-10-04T16:00:00Z" },
  ]);
  assert.deepEqual(Array.from(a.run("papersForNewlyAddedPanel(state.papers).map(p=>p.doi)")), [latePaper.doi, "at-start"]);
});

test("publication picks use the actual last seven days, excluding future dates", () => {
  const a = app([
    { ...latePaper, publication_date: "2026-09-28", available_online_date: null },
    { ...latePaper, doi: "before-window", publication_date: "2026-09-27", available_online_date: null },
    { ...latePaper, doi: "future", publication_date: "2026-12-01", available_online_date: null },
  ]);
  assert.deepEqual(Array.from(a.run("papersInLatestWindow(state.papers,7).map(p=>p.doi)")), [latePaper.doi]);
});

test("local date labels do not shift to the previous UTC day", () => {
  const a = app();
  assert.equal(a.run("toDateString(currentLocalDate())"), "2026-10-04");
  assert.equal(a.run("toDateString(parsePaperDate('2026-10-01'))"), "2026-10-01");
});

test("render records the calendar day used by its panels", () => {
  const a = app([latePaper]);
  a.run("renderRecentOverview=()=>{}; renderWeeklyDigest=()=>{}; renderPaperList=()=>{}; markStaticUiForTranslation=()=>{}; translateVisibleTitles=()=>{}; translateRenderedPage=()=>{}; queueBunnyMove=()=>{}; render()");
  assert.equal(a.run("state.renderedDate"), "2026-10-04");
});

test("papers without first-seen timestamps are retained in the main list", () => {
  const a = app([{ ...latePaper, first_seen_at: null }]);
  assert.equal(a.run("papersForList(dashboardPapers()).length"), 1);
  assert.equal(a.run("papersForNewlyAddedPanel(dashboardPapers()).length"), 0);
});

test("filter rebuilding preserves All months and valid user selections", () => {
  const a = app([latePaper]);
  a.run("state.filters.month=''; state.filters.journal='Hearing Research'; populateFilters()");
  assert.equal(a.run("state.filters.month"), "");
  assert.equal(a.elements.get("#monthFilter").value, "");
  assert.equal(a.elements.get("#journalFilter").value, "Hearing Research");
  a.run("state.filters.journal='removed journal'; populateFilters()");
  assert.equal(a.run("state.filters.journal"), "");
});

test("View all opens the complete weekly-added list and clears conflicting filters", () => {
  const a = app(Array.from({ length: 8 }, (_, i) => ({ ...latePaper, doi: `paper-${i}` })));
  a.run("render=()=>{}; state.filters.query='old search'; state.filters.journal='JASA Express Letters'; showNewlyAddedPapers()");
  assert.equal(a.run("state.filters.month"), "__weekly_added");
  assert.equal(a.run("state.filters.query"), "");
  assert.equal(a.run("state.filters.journal"), "");
  assert.equal(a.run("state.papers.filter(matchesFilters).length"), 8);
});

test("automatic refresh updates metadata even when generated timestamp is unchanged", async () => {
  const a = app([latePaper]);
  let payload = { generated_at: "2026-10-04T08:31:03Z", papers: [latePaper] };
  a.context.fetch = async () => ({ ok: true, json: async () => payload });
  await a.run("loadData()");
  assert.equal(await a.run("loadData({onlyIfChanged:true})"), false);
  payload = { ...payload, papers: [{ ...latePaper, abstract: "New abstract" }] };
  assert.equal(await a.run("loadData({onlyIfChanged:true})"), true);
  assert.equal(a.run("state.papers[0].abstract"), "New abstract");
});

test("failed refresh preserves papers, timestamp and filters", async () => {
  const a = app([latePaper]);
  a.context.fetch = async () => { throw new Error("Network unavailable"); };
  a.run("state.filters.journal='Hearing Research'");
  assert.equal(await a.run("loadData({preserveOnError:true})"), false);
  assert.equal(a.run("state.papers.length"), 1);
  assert.equal(a.run("state.generatedAt"), "2026-10-04T08:31:03Z");
  assert.equal(a.run("state.filters.journal"), "Hearing Research");
});

test("unchanged data still refreshes calendar-based panels after midnight", async () => {
  const a = app([latePaper]);
  a.context.fetch = async () => ({ ok: true, json: async () => ({ papers: [latePaper] }) });
  await a.run("loadData()");
  a.run("state.renderedDate='2026-10-03'; globalThis.renderCalls=0; render=()=>{renderCalls++; state.renderedDate=toDateString(currentLocalDate())}");
  await a.run("refreshData()");
  assert.equal(a.run("renderCalls"), 1);
  assert.equal(a.run("state.renderedDate"), "2026-10-04");
});

test("refresh triggers are registered and background or overlapping requests are skipped", async () => {
  const a = app([latePaper]);
  let calls = 0;
  a.context.fetch = async () => { calls++; return { ok: true, json: async () => ({ papers: [latePaper] }) }; };
  a.run("startDataRefresh(); render=()=>{}");
  assert.equal(a.timers[0].delay, 300000);
  assert.ok(a.events.has("focus"));
  assert.ok(a.events.has("visibilitychange"));
  a.context.document.hidden = true;
  await a.run("refreshData()");
  assert.equal(calls, 0);
  a.context.document.hidden = false;
  a.run("state.dataRefreshInProgress=true");
  await a.run("refreshData()");
  assert.equal(calls, 0);
  a.run("state.dataRefreshInProgress=false; state.filters.month='2026-09'");
  await a.run("refreshData()");
  assert.equal(calls, 1);
  assert.equal(a.run("state.filters.month"), "2026-09");
  assert.equal(a.run("state.dataRefreshInProgress"), false);
  await a.run("refreshData()");
  assert.equal(calls, 1);
});
