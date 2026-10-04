const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {test} = require("node:test");
const context = vm.createContext({Date, console});
vm.runInContext(fs.readFileSync(path.join(__dirname, "../assets/research.js"), "utf8").replace(/^export /gm, ""), context);
const {matchesResearchQuery, createPaperLibrary, paperStorageKey, articleCategory, matchesLibraryView, uniqueBatchBibTeX} = context;

test("search combines separated keywords and exact phrases across title and abstract", () => {
  const paper = {title: "Cochlear implant perception", abstract: "Forty listeners took a speech in noise test.", authors: ["Jane Smith"]};
  assert.equal(matchesResearchQuery(paper, 'implant "speech in noise" Smith'), true);
  assert.equal(matchesResearchQuery(paper, 'implant "speech in noise"', "identity"), false);
  assert.equal(matchesResearchQuery(paper, 'implant -listeners'), false);
  assert.equal(matchesResearchQuery(paper, 'hearing aid OR cochlear implant'), true);
  assert.equal(matchesResearchQuery(paper, 'implant nonexisting'), false);
});

test("favorites, reading states and notes persist together across reloads", () => {
  const values = new Map();
  const storage = {getItem: key => values.get(key), setItem: (key,value) => values.set(key,value)};
  const paper = {doi: "10.0000/TEST", title: "Test"};
  const library = createPaperLibrary(() => storage);
  library.update(paper, {favorite: true, note: "Check Figure 2"});
  library.update(paper, {read: true, later: true});
  const restored = createPaperLibrary(() => storage).get(paper);
  assert.equal(restored.favorite, true);
  assert.equal(restored.read, true);
  assert.equal(restored.later, true);
  assert.equal(restored.note, "Check Figure 2");
  assert.equal(paperStorageKey({...paper, doi: "https://doi.org/10.0000/test"}), paperStorageKey(paper));
  assert.equal(matchesLibraryView(restored, "unread"), false);
});

test("backup import merges without overwriting a more recent note", () => {
  const library = createPaperLibrary(() => ({getItem() {}, setItem() {}}));
  const paper = {doi: "10.0000/merge", title: "Test"};
  library.update(paper, {note: "Current", favorite: true});
  library.import(JSON.stringify({version: 1, items: {"doi:10.0000/merge": {note: "Old", updated_at: "2000-01-01T00:00:00Z"}, "doi:10.0000/other": {note: "Restored", read: true}}}));
  assert.equal(library.get(paper).note, "Current");
  assert.equal(library.get({doi: "10.0000/other"}).note, "Restored");
  assert.throws(() => library.import('{"version":1,"items":{"__proto__":{}}}'), /Invalid/);
  assert.throws(() => library.import('{"version":2,"items":{}}'), /version 1/);
  assert.equal(library.get(paper).favorite, true);
});

test("failed storage writes keep a recoverable backup and an honest warning", () => {
  const library = createPaperLibrary(() => ({getItem() {}, setItem() {throw new Error("Quota");}}));
  const paper = {doi: "10.0000/quota"};
  assert.equal(library.update(paper, {note: "Recover me"}), false);
  assert.match(library.warning, /only for this session/);
  assert.match(library.export(), /Recover me/);
});

test("article category uses only explicit title cues or preprint source", () => {
  assert.equal(articleCategory({title: "A scoping review of cochlear implants"}), "review");
  assert.equal(articleCategory({title: "A randomized controlled trial"}), "trial");
  assert.equal(articleCategory({title: "Research", source_group: "preprint_filtered"}), "preprint");
  assert.equal(articleCategory({title: "Hearing aid benefits", abstract: "A review of prior work introduces our experiment."}), "other");
});

test("batch BibTeX avoids citation key collisions", () => {
  const output = uniqueBatchBibTeX([{}, {}, {}], () => "@article{same,\n title={Test}\n}");
  assert.equal((output.match(/@article\{/g) || []).length, 3);
  assert.match(output, /@article\{same_2,/);
  assert.match(output, /@article\{same_3,/);
});
