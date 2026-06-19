"use strict";

const form = document.getElementById("consultationForm");
const notes = document.getElementById("notes");
const wordCount = document.getElementById("wordCount");
const notesTab = document.getElementById("notesTab");
const audioTab = document.getElementById("audioTab");
const notesPanel = document.getElementById("notesPanel");
const audioPanel = document.getElementById("audioPanel");
const emptyReport = document.getElementById("emptyReport");
const reportDocument = document.getElementById("reportDocument");
const reportSections = document.getElementById("reportSections");
const copyButton = document.getElementById("copyButton");
const downloadButton = document.getElementById("downloadButton");
const clearButton = document.getElementById("clearButton");
const toast = document.getElementById("toast");

const sectionDefinitions = [
  ["Executive Summary", "executiveSummary"],
  ["Key Findings", "keyFindings"],
  ["Main Themes", "mainThemes"],
  ["Community Feedback", "communityFeedback"],
  ["Recommendations", "recommendations"],
  ["Action Items", "actionItems"],
  ["Key Quotes", "keyQuotes"],
  ["Next Steps", "nextSteps"]
];

function clean(value) {
  return String(value || "").trim();
}

function escapeHTML(value) {
  return clean(value).replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
}

function getData() {
  return Object.fromEntries([...new FormData(form).entries()].map(([key, value]) => [key, clean(value)]));
}

function formatDate(value) {
  if (!value) return "Not specified";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function sentencesFrom(source) {
  return source
    .replace(/[“”]/g, '"')
    .split(/(?<=[.!?])\s+|\n+/)
    .map(item => item.trim())
    .filter(item => item.length > 18);
}

function listItemsFrom(source) {
  const priorityLine = source.match(/(?:priority actions?|actions? identified|agreed actions?)[^:]*:\s*([^\n.]+)/i);
  if (!priorityLine) return [];
  return priorityLine[1].split(/;|,(?=\s(?:and\s)?[a-z])/i).map(item => item.trim().replace(/^and\s+/i, "")).filter(Boolean);
}

function findRelevant(sentences, terms, limit = 2) {
  const matches = sentences.filter(sentence => terms.some(term => sentence.toLowerCase().includes(term)));
  return [...new Set(matches)].slice(0, limit);
}

function sentenceCase(value) {
  const text = clean(value).replace(/[.;]+$/, "");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function buildReport(data) {
  const sentences = sentencesFrom(data.notes);
  const actions = listItemsFrom(data.notes);
  const quotes = [...data.notes.matchAll(/[“"]([^”"]{12,220})[”"]/g)].map(match => match[1]);
  const access = findRelevant(sentences, ["access", "opening", "transport", "crossing", "bus"]);
  const inclusion = findRelevant(sentences, ["multilingual", "translated", "language", "inclusive", "bilingual"]);
  const participation = findRelevant(sentences, ["young", "youth", "co-design", "working group"]);
  const followUp = findRelevant(sentences, ["update", "follow", "review", "pilot", "within"]);
  const context = [data.participants, data.location].filter(Boolean).join(" at ");
  const themes = [];

  if (access.length) themes.push(`<li><strong>Access and participation.</strong> ${escapeHTML(sentenceCase(access[0]))}</li>`);
  if (inclusion.length) themes.push(`<li><strong>Inclusive communication.</strong> ${escapeHTML(sentenceCase(inclusion[0]))}</li>`);
  if (participation.length) themes.push(`<li><strong>Community-led design.</strong> ${escapeHTML(sentenceCase(participation[0]))}</li>`);
  if (!themes.length) sentences.slice(0, 3).forEach((sentence, index) => themes.push(`<li><strong>Theme ${index + 1}.</strong> ${escapeHTML(sentenceCase(sentence))}</li>`));

  const evidence = [...new Set([...access, ...inclusion, ...participation])].slice(0, 4);
  const actionList = actions.length ? actions : followUp.length ? followUp : sentences.slice(-3);
  const recommendations = actionList.slice(0, 5).map(item => `<li>${escapeHTML(sentenceCase(item))}.</li>`).join("");
  const actionRows = actionList.slice(0, 5).map((item, index) => `<li><strong>Action ${index + 1}:</strong> ${escapeHTML(sentenceCase(item))}. Confirm responsibility, timing and success measures with the relevant stakeholders.</li>`).join("");

  return {
    executiveSummary: `<p>This report presents the outcomes of the <strong>${escapeHTML(data.title)}</strong>, undertaken for ${escapeHTML(data.preparedFor || data.organization)} on ${escapeHTML(formatDate(data.consultationDate))}. ${context ? `The consultation brought together ${escapeHTML(context)}. ` : ""}Participants identified practical opportunities to strengthen access, inclusion and community participation.</p><p>The findings provide a structured evidence base for consideration. They should be reviewed alongside the original consultation notes and validated with relevant community members before final decisions are made.</p>`,
    keyFindings: `<ul>${(evidence.length ? evidence : sentences.slice(0, 4)).map(item => `<li>${escapeHTML(sentenceCase(item))}</li>`).join("")}</ul>`,
    mainThemes: `<ul>${themes.join("")}</ul>`,
    communityFeedback: `<p>Feedback reflected both appreciation for existing community strengths and a clear expectation of practical follow-through. Participants emphasised that improvements should be accessible, responsive to different community needs and developed with—not only for—the people affected.</p>${evidence.slice(0, 2).map(item => `<p>${escapeHTML(sentenceCase(item))}</p>`).join("")}`,
    recommendations: `<ol>${recommendations || "<li>Validate the emerging priorities with participants and relevant decision-makers.</li><li>Develop an implementation plan with clear ownership, timeframes and measures of progress.</li>"}</ol>`,
    actionItems: `<ol>${actionRows || "<li><strong>Action 1:</strong> Confirm consultation priorities and circulate a written update to participants.</li>"}</ol>`,
    keyQuotes: quotes.length ? quotes.slice(0, 5).map(quote => `<blockquote>“${escapeHTML(quote)}”</blockquote>`).join("") : `<p>No direct quotations were identified in the source notes. Add verified participant quotations here where they strengthen the evidence and can be used with appropriate consent.</p>`,
    nextSteps: `<ol><li>Review this draft against the original notes for accuracy, balance and appropriate representation.</li><li>Confirm priorities, responsibilities and delivery timeframes with relevant teams and community representatives.</li>${followUp.length ? `<li>${escapeHTML(sentenceCase(followUp[0]))}</li>` : "<li>Provide participants with an update on decisions and planned actions.</li>"}<li>Document progress and return to the community with outcomes from the consultation.</li></ol>`
  };
}

function renderReport(data, report) {
  document.getElementById("reportTitle").textContent = data.title;
  document.getElementById("reportSubtitle").textContent = `${data.organization} · ${data.location || "Community consultation"}`;

  const metadata = [
    ["Prepared for", data.preparedFor || "Not specified"],
    ["Prepared by", data.preparedBy || "Not specified"],
    ["Organization", data.organization],
    ["Date", formatDate(data.consultationDate)],
    ["Consultation type", data.consultationType],
    ["Participants", data.participants || "Not specified"]
  ];
  document.getElementById("reportMeta").innerHTML = metadata.map(([label, value]) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join("");

  reportSections.innerHTML = sectionDefinitions.map(([title, key], index) => `
    <section class="report-section">
      <div class="report-section-header"><span class="section-number">${String(index + 1).padStart(2, "0")}</span><h3>${title}</h3></div>
      <div class="editable-content" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Edit ${title}">${report[key]}</div>
    </section>`).join("");

  emptyReport.hidden = true;
  reportDocument.hidden = false;
  copyButton.disabled = false;
  downloadButton.disabled = false;
  document.getElementById("draftStatus").classList.add("ready");
  document.getElementById("draftStatus").innerHTML = "<i></i> Draft ready for professional review";
  document.querySelectorAll(".quality-list li").forEach(item => item.classList.add("checked"));
  document.getElementById("qualityScore").textContent = "4/4";
  setProgress("report");
}

function setProgress(stage) {
  const stages = ["input", "review", "report", "export"];
  const activeIndex = stages.indexOf(stage);
  document.querySelectorAll("[data-progress]").forEach((item, index) => {
    item.classList.toggle("complete", index < activeIndex);
    item.classList.toggle("active", index === activeIndex);
    const number = item.querySelector(":scope > span");
    number.textContent = index < activeIndex ? "✓" : String(index + 1);
  });
}

function reportAsText() {
  const data = getData();
  const lines = [
    data.title.toUpperCase(),
    `${data.organization}${data.location ? ` · ${data.location}` : ""}`,
    "",
    `Prepared For: ${data.preparedFor || "Not specified"}`,
    `Prepared By: ${data.preparedBy || "Not specified"}`,
    `Organization: ${data.organization || "Not specified"}`,
    `Date: ${formatDate(data.consultationDate)}`,
    `Consultation Type: ${data.consultationType || "Not specified"}`,
    `Participants: ${data.participants || "Not specified"}`,
    "",
    "─".repeat(64)
  ];

  document.querySelectorAll(".report-section").forEach(section => {
    lines.push("", section.querySelector("h3").textContent.toUpperCase(), "", section.querySelector(".editable-content").innerText.trim());
  });
  lines.push("", "─".repeat(64), "Review this structured draft against the original consultation notes before sharing.");
  return lines.join("\n");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function selectTab(tabName) {
  const showNotes = tabName === "notes";
  notesTab.classList.toggle("active", showNotes);
  audioTab.classList.toggle("active", !showNotes);
  notesTab.setAttribute("aria-selected", String(showNotes));
  audioTab.setAttribute("aria-selected", String(!showNotes));
  notesPanel.hidden = !showNotes;
  audioPanel.hidden = showNotes;
}

function updateWordCount() {
  const count = clean(notes.value) ? clean(notes.value).split(/\s+/).length : 0;
  wordCount.textContent = `${count} word${count === 1 ? "" : "s"}`;
}

form.addEventListener("submit", event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const data = getData();
  if (data.notes.length < 40) {
    notes.focus();
    showToast("Add a little more detail to create a useful draft.");
    return;
  }
  setProgress("review");
  renderReport(data, buildReport(data));
  showToast("Structured draft created. Review each section before sharing.");
  document.getElementById("reportArea").scrollIntoView({ behavior: "smooth", block: "start" });
});

copyButton.addEventListener("click", async () => {
  const text = reportAsText();
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
  }
  setProgress("export");
  showToast("Full report copied to your clipboard.");
});

downloadButton.addEventListener("click", () => {
  const data = getData();
  const blob = new Blob([reportAsText()], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${(data.title || "consultation-report").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
  setProgress("export");
  showToast("TXT report downloaded.");
});

clearButton.addEventListener("click", () => {
  form.reset();
  [...form.elements].forEach(element => {
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") element.value = "";
  });
  document.getElementById("consultationType").selectedIndex = 0;
  selectTab("notes");
  updateWordCount();
  emptyReport.hidden = false;
  reportDocument.hidden = true;
  reportSections.innerHTML = "";
  copyButton.disabled = true;
  downloadButton.disabled = true;
  document.getElementById("draftStatus").classList.remove("ready");
  document.getElementById("draftStatus").innerHTML = "<i></i> Waiting for consultation input";
  document.querySelectorAll(".quality-list li").forEach(item => item.classList.remove("checked"));
  document.getElementById("qualityScore").textContent = "0/4";
  setProgress("input");
  document.getElementById("title").focus();
  showToast("Form cleared. Ready for a new consultation.");
});

notesTab.addEventListener("click", () => selectTab("notes"));
audioTab.addEventListener("click", () => selectTab("audio"));
notes.addEventListener("input", updateWordCount);
updateWordCount();
