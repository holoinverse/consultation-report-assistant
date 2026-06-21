"use strict";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const templateStorageKey = "consultation-report-assistant.templates.v1";
const organisationTemplateStorageKey = "consultation-report-assistant.organisation-templates.v1";
let sectionSequence = 0;
let organisationReviewState = { templateId: "", source: null, sections: [] };
let showingArchivedOrganisationTemplates = false;

const form = $("#consultationForm");
const notes = $("#notes");
const reportDocument = $("#reportDocument");
const reportSections = $("#reportSections");
const reportType = $("#reportType");
const numberingStyle = $("#numberingStyle");
const copyButton = $("#copyButton");
const downloadButton = $("#downloadButton");
const docxButton = $("#docxButton");
const pdfButton = $("#pdfButton");
const saveTemplateButton = $("#saveTemplate");
const savedTemplates = $("#savedTemplates");
const toast = $("#toast");

const presets = {
  "Consultation Report": ["Executive Summary", "Consultation Context", "Key Findings", "Main Themes", "Community Feedback", "Recommendations", "Action Items", "Key Quotes", "Next Steps"],
  "Community Consultation Report": ["Executive Summary", "Consultation Context", "Who We Heard From", "Community Priorities", "Stakeholder Feedback", "Recommendations", "Action Items", "Next Steps"],
  "Policy Brief": ["Executive Summary", "Policy Issue", "Background", "Evidence from Consultation", "Key Insights", "Policy Options", "Recommendations", "Implementation Considerations", "Next Steps"],
  "Committee Minutes": ["Meeting Details", "Attendance", "Apologies", "Agenda Items", "Key Discussion Points", "Decisions Made", "Action Items", "Next Meeting"],
  "Executive Brief": ["Purpose", "Executive Summary", "Critical Findings", "Decisions Required", "Risks", "Recommended Actions", "Next Steps"],
  "Meeting Report": ["Meeting Overview", "Attendees", "Discussion Summary", "Decisions", "Action Items", "Open Issues", "Next Meeting"],
  "Submission Draft": ["Executive Summary", "About the Organization", "Submission Context", "Key Issues", "Evidence", "Recommendations", "Conclusion"],
  "Submission": ["Executive Summary", "About the Organization", "Consultation Context", "Key Issues", "Evidence", "Recommendations", "Conclusion"],
  "Internal Summary": ["Purpose", "Consultation Overview", "Key Findings", "Risks", "Decisions Required", "Action Items", "Next Steps"],
  "Workshop Summary": ["Workshop Overview", "Participants", "Discussion Topics", "Key Insights", "Activities and Feedback", "Actions Agreed", "Responsibilities", "Follow Up", "Next Steps"],
  "Community Engagement Report": ["Executive Summary", "Engagement Approach", "Who We Heard From", "Main Themes", "Stakeholder Feedback", "Community Priorities", "Recommendations", "Next Steps"],
  "Custom": ["Executive Summary", "New Section"]
};

const builtInTemplateMetadata = {
  "Consultation Report": {
    category: "Consultation",
    description: "Use this template for structured community consultation reports, including findings, themes, recommendations, quotes, action items, and next steps."
  },
  "Workshop Summary": {
    category: "Workshop",
    description: "Use this template to summarise workshop activities, participant input, key insights, agreed actions, responsibilities, and follow-up."
  },
  "Policy Brief": {
    category: "Policy",
    description: "Use this template for concise policy-facing documents that explain an issue, present consultation evidence, outline options, and recommend actions."
  },
  "Committee Minutes": {
    category: "Internal",
    description: "Use this template to record committee meetings, attendance, apologies, agenda items, discussion points, decisions, actions, and the next meeting."
  }
};

const state = {
  generated: false,
  generatedAt: "",
  reportType: "Consultation Report",
  numberingStyle: "automatic",
  sections: [],
  loadedTemplate: null,
  organisationTemplate: null,
  branding: {
    fontFamily: "Georgia, serif",
    fontColor: "#40525e",
    backgroundColor: "#ffffff",
    accentColor: "#12706a",
    logo: "",
    image: "",
    watermarkEnabled: false,
    watermarkText: "DRAFT",
    logoName: "",
    imageName: ""
  },
  layout: {
    coverPage: true,
    tableOfContents: false,
    pageNumbers: true,
    headerText: "",
    headerOrganization: true,
    headerDate: false,
    footerText: "",
    footerOrganization: false,
    footerDate: true,
    confidentialityEnabled: false,
    confidentialityText: "Confidential — for authorised recipients only"
  },
  audio: {
    name: "",
    size: 0,
    type: "",
    duration: 0,
    dataUrl: "",
    transcript: "",
    status: "draft",
    approved: false,
    nameCorrections: [],
    organizationCorrections: [],
    reviewNotes: "",
    checks: { names: false, organizations: false, quotes: false },
    reportTemplate: "Consultation Report"
  }
};

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
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function sentencesFrom(source) {
  return source.replace(/[“”]/g, '"').split(/(?<=[.!?])\s+|\n+/).map(item => item.trim()).filter(item => item.length > 18);
}

function listItemsFrom(source) {
  const match = source.match(/(?:priority actions?|actions? identified|agreed actions?)[^:]*:\s*([^\n.]+)/i);
  return match ? match[1].split(/;|,(?=\s(?:and\s)?[a-z])/i).map(item => item.trim().replace(/^and\s+/i, "")).filter(Boolean) : [];
}

function findRelevant(sentences, terms, limit = 2) {
  return [...new Set(sentences.filter(sentence => terms.some(term => sentence.toLowerCase().includes(term))))].slice(0, limit);
}

function sentenceCase(value) {
  const text = clean(value).replace(/[.;]+$/, "");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function createBaseContent(data) {
  const sentences = sentencesFrom(data.notes);
  const actions = listItemsFrom(data.notes);
  const quotes = [...data.notes.matchAll(/[“"]([^”"]{12,220})[”"]/g)].map(match => match[1]);
  const access = findRelevant(sentences, ["access", "opening", "transport", "crossing", "bus"]);
  const inclusion = findRelevant(sentences, ["multilingual", "translated", "language", "inclusive", "bilingual"]);
  const participation = findRelevant(sentences, ["young", "youth", "co-design", "working group"]);
  const followUp = findRelevant(sentences, ["update", "follow", "review", "pilot", "within"]);
  const evidence = [...new Set([...access, ...inclusion, ...participation])].slice(0, 4);
  const priorities = actions.length ? actions : sentences.slice(-3);
  const context = [data.participants, data.location].filter(Boolean).join(" at ");
  const evidenceList = (evidence.length ? evidence : sentences.slice(0, 4)).map(item => `<li>${escapeHTML(sentenceCase(item))}</li>`).join("");
  const priorityList = priorities.slice(0, 5).map(item => `<li>${escapeHTML(sentenceCase(item))}.</li>`).join("");
  const themes = [
    access[0] && `<li><strong>Access and participation.</strong> ${escapeHTML(sentenceCase(access[0]))}</li>`,
    inclusion[0] && `<li><strong>Inclusive communication.</strong> ${escapeHTML(sentenceCase(inclusion[0]))}</li>`,
    participation[0] && `<li><strong>Community-led design.</strong> ${escapeHTML(sentenceCase(participation[0]))}</li>`
  ].filter(Boolean).join("") || sentences.slice(0, 3).map((item, index) => `<li><strong>Theme ${index + 1}.</strong> ${escapeHTML(sentenceCase(item))}</li>`).join("");
  const actionsList = priorities.slice(0, 5).map((item, index) => `<li><strong>Action ${index + 1}:</strong> ${escapeHTML(sentenceCase(item))}. Confirm ownership, timing and measures of progress.</li>`).join("");
  const summary = `<p>This ${escapeHTML(data.reportType.toLowerCase())} presents the outcomes of the <strong>${escapeHTML(data.title)}</strong>, undertaken for ${escapeHTML(data.preparedFor || data.organization)} on ${escapeHTML(formatDate(data.consultationDate))}. ${context ? `The consultation brought together ${escapeHTML(context)}. ` : ""}Participants identified practical opportunities to strengthen access, inclusion and community participation.</p><p>The findings provide a structured evidence base for consideration and should be validated against the original notes before final decisions are made.</p>`;

  return {
    "Executive Summary": summary,
    "Purpose": `<p>This summary documents the purpose, evidence and agreed follow-up arising from ${escapeHTML(data.title)}.</p>`,
    "Policy Context": `<p>The consultation evidence should be considered within the relevant policy, service and community context. The findings below identify practical implications for decision-makers.</p>`,
    "Evidence and Findings": `<ul>${evidenceList}</ul>`,
    "Key Findings": `<ul>${evidenceList}</ul>`,
    "Critical Findings": `<ul>${evidenceList}</ul>`,
    "Main Themes": `<ul>${themes}</ul>`,
    "Discussion Themes": `<ul>${themes}</ul>`,
    "Community Feedback": `<p>Feedback reflected appreciation for existing community strengths and a clear expectation of practical follow-through. Participants emphasised accessible, responsive and community-led implementation.</p>${evidence.slice(0, 2).map(item => `<p>${escapeHTML(sentenceCase(item))}</p>`).join("")}`,
    "Stakeholder Feedback": `<ul>${evidenceList}</ul>`,
    "Community Priorities": `<ol>${priorityList}</ol>`,
    "Recommendations": `<ol>${priorityList || "<li>Validate the emerging priorities with participants and relevant decision-makers.</li><li>Develop an implementation plan with clear ownership and timeframes.</li>"}</ol>`,
    "Policy Options": `<ol>${priorityList}</ol>`,
    "Action Items": `<ol>${actionsList}</ol>`,
    "Recommended Actions": `<ol>${actionsList}</ol>`,
    "Agreed Actions": `<ol>${actionsList}</ol>`,
    "Key Quotes": quotes.length ? quotes.slice(0, 5).map(quote => `<blockquote>“${escapeHTML(quote)}”</blockquote>`).join("") : "<p>No verified direct quotations were identified in the source notes.</p>",
    "Next Steps": `<ol><li>Review this draft against the original notes for accuracy and balance.</li><li>Confirm priorities, responsibilities and delivery timeframes.</li>${followUp[0] ? `<li>${escapeHTML(sentenceCase(followUp[0]))}</li>` : "<li>Provide participants with an update on decisions and planned actions.</li>"}<li>Document progress and return to the community with outcomes.</li></ol>`,
    "Consultation Overview": `<p>${escapeHTML(data.title)} was conducted as a ${escapeHTML(data.consultationType.toLowerCase())}${data.location ? ` in ${escapeHTML(data.location)}` : ""}${data.participants ? ` with ${escapeHTML(data.participants)}` : ""}.</p>`,
    "Consultation Context": `<p>${escapeHTML(data.title)} provided a structured opportunity to understand community experience, priorities and expectations.</p>`,
    "Submission Context": `<p>This submission draws on consultation evidence from ${escapeHTML(data.title)} and identifies matters for consideration by decision-makers.</p>`,
    "Workshop Overview": `<p>The workshop brought together ${escapeHTML(data.participants || "participants")} to discuss priorities, opportunities and practical next steps.</p>`,
    "Participants": `<p>${escapeHTML(data.participants || "Participant details were not specified.")}</p>`,
    "Attendees": `<p>${escapeHTML(data.participants || "Attendee details were not specified.")}</p>`,
    "Who We Heard From": `<p>${escapeHTML(data.participants || "Participant details were not specified.")}</p>`,
    "Engagement Approach": `<p>The engagement used a ${escapeHTML(data.consultationType.toLowerCase())} format to gather qualitative feedback and identify shared priorities.</p>`,
    "Key Issues": `<ul>${evidenceList}</ul>`,
    "Evidence": `<ul>${evidenceList}</ul>`,
    "Risks": `<p>Key delivery risks should be reviewed with responsible teams, including access barriers, unclear ownership, insufficient follow-through and limited communication with participants.</p>`,
    "Decisions Required": `<ol>${priorityList}</ol>`,
    "Decisions": `<ol>${priorityList}</ol>`,
    "Discussion Summary": `<ul>${themes}</ul>`,
    "Meeting Overview": `<p>${escapeHTML(data.title)} brought together ${escapeHTML(data.participants || "participants")} to review priorities, evidence and required follow-up.</p>`,
    "Open Issues": `<ul>${evidenceList}</ul>`,
    "Next Meeting": `<p>Confirm the next meeting date, responsible participants and matters requiring progress updates.</p>`,
    "Implementation Considerations": `<p>Implementation should define clear ownership, realistic timeframes, accessible communication and a process for reporting progress to participants.</p>`,
    "About the Organization": `<p>${escapeHTML(data.organization)} commissioned or prepared this report to support transparent, evidence-informed engagement and decision-making.</p>`,
    "Conclusion": `<p>The consultation provides a practical foundation for action. Timely decisions, transparent communication and continued community involvement will be important to maintaining trust.</p>`
  };
}

function newSection(title, content, number, metadata = {}) {
  return { id: `section-${Date.now()}-${++sectionSequence}`, number: String(number), title, content, ...metadata };
}

function structureForGeneration(data, contentMap) {
  const structure = state.organisationTemplate?.sections || state.loadedTemplate?.sections || presets[data.reportType] || presets.Custom;
  return structure.map((item, index) => {
    const title = typeof item === "string" ? item : item.title;
    const number = typeof item === "string" ? String(index + 1).padStart(2, "0") : (item.number || String(index + 1).padStart(2, "0"));
    const metadata = typeof item === "string" ? {} : { headingLevel: item.headingLevel || item.level || 1, organisationSectionId: item.id || "" };
    return newSection(title, contentMap[title] || "<p>Add evidence, analysis or professional commentary for this section.</p>", number, metadata);
  });
}

function effectiveNumber(section, index) {
  if (state.numberingStyle === "none") return "";
  if (state.numberingStyle === "automatic") return String(index + 1).padStart(2, "0");
  return section.number;
}

function renderSections() {
  reportSections.innerHTML = state.sections.map((section, index) => `
    <section id="report-${section.id}" class="report-section" data-section-id="${section.id}">
      <div class="section-editor-head">
        <label class="sr-only" for="number-${section.id}">Section number</label>
        <input id="number-${section.id}" class="section-number-input ${state.numberingStyle === "none" ? "number-hidden" : ""}" data-field="number" value="${escapeHTML(effectiveNumber(section, index))}" ${state.numberingStyle !== "manual" ? "disabled" : ""} maxlength="12">
        <label class="sr-only" for="title-${section.id}">Section title</label>
        <input id="title-${section.id}" class="section-title-input" data-field="title" value="${escapeHTML(section.title)}" maxlength="120">
        <div class="section-controls" aria-label="Section controls">
          <button class="section-control" type="button" data-action="up" aria-label="Move ${escapeHTML(section.title)} up" title="Move up" ${index === 0 ? "disabled" : ""}>↑</button>
          <button class="section-control" type="button" data-action="down" aria-label="Move ${escapeHTML(section.title)} down" title="Move down" ${index === state.sections.length - 1 ? "disabled" : ""}>↓</button>
          <button class="section-control remove" type="button" data-action="remove" aria-label="Remove ${escapeHTML(section.title)}" title="Remove section">×</button>
        </div>
      </div>
      <div class="rich-toolbar" role="toolbar" aria-label="Formatting for ${escapeHTML(section.title)}">
        <button class="rich-tool" type="button" data-command="bold" aria-label="Bold" title="Bold">B</button>
        <button class="rich-tool" type="button" data-command="italic" aria-label="Italic" title="Italic">I</button>
        <button class="rich-tool" type="button" data-command="underline" aria-label="Underline" title="Underline">U</button>
        <span class="rich-tool-separator" aria-hidden="true"></span>
        <button class="rich-tool" type="button" data-command="insertUnorderedList" aria-label="Bullet list" title="Bullet list">• List</button>
        <button class="rich-tool" type="button" data-command="insertOrderedList" aria-label="Numbered list" title="Numbered list">1. List</button>
        <button class="rich-tool" type="button" data-command="formatBlock" data-value="blockquote" aria-label="Quote" title="Quote">“ ”</button>
        <button class="rich-tool" type="button" data-command="formatBlock" data-value="h3" aria-label="Heading" title="Heading">H</button>
      </div>
      <div class="editable-content" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Edit ${escapeHTML(section.title)} content" data-field="content">${section.content}</div>
    </section>`).join("");
  numberingStyle.value = state.numberingStyle;
  if (state.generated) { renderTableOfContents(); updateReportIntelligence(); }
}

function renderHeader(data = getData()) {
  $("#reportTitle").textContent = data.title || "Untitled report";
  $("#reportSubtitle").textContent = [data.organization, data.location].filter(Boolean).join(" · ");
  $("#reportTypeLabel").textContent = state.reportType;
  const metadata = [
    ["Prepared for", data.preparedFor || "Not specified"], ["Prepared by", data.preparedBy || "Not specified"],
    ["Organization", data.organization || "Not specified"], ["Date", formatDate(data.consultationDate)],
    ["Consultation type", data.consultationType || "Not specified"], ["Participants", data.participants || "Not specified"]
  ];
  $("#reportMeta").innerHTML = metadata.map(([label, value]) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join("");
}

function applyBranding() {
  reportDocument.style.setProperty("--report-font", state.branding.fontFamily);
  reportDocument.style.setProperty("--report-color", state.branding.fontColor);
  reportDocument.style.setProperty("--report-bg", state.branding.backgroundColor);
  reportDocument.style.setProperty("--report-accent", state.branding.accentColor);
  const logo = $("#reportLogo");
  if (state.branding.logo) logo.src = state.branding.logo;
  else logo.removeAttribute("src");
  logo.hidden = !state.branding.logo;
  const image = $("#reportFeatureImage");
  if (state.branding.image) image.src = state.branding.image;
  else image.removeAttribute("src");
  image.hidden = !state.branding.image;
  const watermark = $("#reportWatermark");
  watermark.textContent = state.branding.watermarkText || "DRAFT";
  watermark.hidden = !state.branding.watermarkEnabled;
  $("#watermarkField").hidden = !state.branding.watermarkEnabled;
}

function reportHeaderText(data = getData()) {
  return [state.layout.headerText, state.layout.headerOrganization ? data.organization : "", state.layout.headerDate ? formatDate(data.consultationDate) : ""].filter(Boolean).join(" · ");
}

function reportFooterText(data = getData()) {
  return [state.layout.footerText, state.layout.footerOrganization ? data.organization : "", state.layout.footerDate ? formatDate(data.consultationDate) : "", state.layout.confidentialityEnabled ? state.layout.confidentialityText : ""].filter(Boolean).join(" · ");
}

function renderTableOfContents() {
  const toc = $("#reportToc");
  toc.hidden = !state.layout.tableOfContents || !state.generated;
  toc.innerHTML = state.layout.tableOfContents ? `<h3>Table of Contents</h3><ol>${state.sections.map((section, index) => `<li><a href="#report-${section.id}"><span>${escapeHTML(effectiveNumber(section, index))}</span>${escapeHTML(section.title)}</a></li>`).join("")}</ol>` : "";
}

function applyLayoutPreview() {
  $(".report-cover").hidden = !state.layout.coverPage;
  const header = $("#reportHeaderPreview");
  const footer = $("#reportFooterPreview");
  const headerText = reportHeaderText();
  const footerText = reportFooterText();
  header.textContent = headerText;
  header.hidden = !headerText;
  footer.innerHTML = `<span>${escapeHTML(footerText)}</span>${state.layout.pageNumbers ? "<span>Page 1</span>" : ""}`;
  footer.hidden = !footerText && !state.layout.pageNumbers;
  $("#confidentialityField").hidden = !state.layout.confidentialityEnabled;
  renderTableOfContents();
}

function showGeneratedReport(data) {
  renderHeader(data);
  renderSections();
  applyBranding();
  applyLayoutPreview();
  $("#emptyReport").hidden = true;
  reportDocument.hidden = false;
  copyButton.disabled = false;
  downloadButton.disabled = false;
  docxButton.disabled = false;
  pdfButton.disabled = false;
  saveTemplateButton.disabled = !clean($("#templateName").value);
  $("#draftStatus").classList.add("ready");
  $("#draftStatus").innerHTML = "<i></i> Draft ready for professional review";
  updateReportIntelligence();
  setProgress("report");
}

function setProgress(stage) {
  const stages = ["input", "review", "report", "export"];
  const activeIndex = stages.indexOf(stage);
  $$("[data-progress]").forEach((item, index) => {
    item.classList.toggle("complete", index < activeIndex);
    item.classList.toggle("active", index === activeIndex);
    item.querySelector(":scope > span").textContent = index < activeIndex ? "✓" : String(index + 1);
  });
}

function htmlToText(html) {
  const helper = document.createElement("div");
  helper.innerHTML = html;
  return helper.innerText.trim();
}

function sectionElementsMatching(pattern) {
  return state.sections.filter(section => pattern.test(section.title));
}

function contentItemCount(pattern) {
  return sectionElementsMatching(pattern).reduce((total, section) => {
    const helper = document.createElement("div");
    helper.innerHTML = section.content;
    const items = helper.querySelectorAll("li").length;
    return total + (items || (clean(helper.innerText) ? 1 : 0));
  }, 0);
}

function analyzeReport() {
  const data = getData();
  const sectionTexts = state.sections.map(section => htmlToText(section.content));
  const allText = sectionTexts.join(" ");
  const words = clean(allText) ? clean(allText).split(/\s+/).length : 0;
  const recommendations = contentItemCount(/recommend|policy options|decisions required/i);
  const actions = contentItemCount(/action|next steps|agreed actions|recommended actions/i);
  const quoteBlocks = state.sections.reduce((total, section) => {
    const helper = document.createElement("div"); helper.innerHTML = section.content;
    return total + helper.querySelectorAll("blockquote").length;
  }, 0);
  const inlineQuotes = (allText.match(/[“"]([^”"]{10,220})[”"]/g) || []).length;
  const quotes = Math.max(quoteBlocks, inlineQuotes);
  const themeSections = sectionElementsMatching(/theme|priorit|key issue|discussion/i);
  const themesFromLists = themeSections.reduce((total, section) => {
    const helper = document.createElement("div"); helper.innerHTML = section.content;
    return total + helper.querySelectorAll("li").length;
  }, 0);
  const themeSignals = [["access", "transport"], ["language", "multilingual", "inclusive"], ["youth", "young people"], ["service", "support"], ["safety", "risk"]];
  const themes = themesFromLists || themeSignals.filter(group => group.some(term => allText.toLowerCase().includes(term))).length;
  const emptySections = state.sections.filter((section, index) => !clean(section.title) || !clean(sectionTexts[index])).length;
  const hasSummary = sectionElementsMatching(/executive summary|^summary$|purpose/i).some(section => clean(htmlToText(section.content)));
  const hasFindings = sectionElementsMatching(/finding|evidence|discussion summary|key issue/i).some(section => clean(htmlToText(section.content)));
  return { data, words, recommendations, actions, quotes, themes, emptySections, hasSummary, hasFindings };
}

function updateReportIntelligence() {
  if (!state.generated) {
    $("#reportIntelligence").hidden = true;
    $("#qualityScore").textContent = "0/0";
    $("#qualityList").innerHTML = '<li class="pending"><span>·</span><div><strong>Waiting for a draft</strong><small>Content checks will run automatically.</small></div></li>';
    return;
  }
  const analysis = analyzeReport();
  $("#reportIntelligence").hidden = false;
  $("#summarySections").textContent = state.sections.length;
  $("#summaryWords").textContent = analysis.words.toLocaleString();
  $("#summaryRecommendations").textContent = analysis.recommendations;
  $("#summaryActions").textContent = analysis.actions;
  $("#summaryQuotes").textContent = analysis.quotes;
  $("#summaryDate").textContent = state.generatedAt ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(state.generatedAt)) : "Today";
  $("#insightParticipants").textContent = analysis.data.participants || "Not specified";
  $("#insightThemes").textContent = analysis.themes;
  $("#insightRecommendations").textContent = analysis.recommendations;
  $("#insightActions").textContent = analysis.actions;
  $("#insightQuotes").textContent = analysis.quotes;
  const checks = [
    [analysis.hasSummary, "Executive summary present", "Add a clear summary or purpose section."],
    [analysis.hasFindings, "Findings or evidence present", "Add findings, evidence or a discussion summary."],
    [analysis.recommendations > 0, "Recommendations present", "Recommendations section is missing or empty."],
    [analysis.actions > 0, "Action items present", "Action items or next steps are missing."],
    [analysis.quotes > 0, "Direct quotes detected", "No direct quotes detected."],
    [analysis.emptySections === 0, "All sections contain content", `${analysis.emptySections} empty section${analysis.emptySections === 1 ? "" : "s"} detected.`]
  ];
  const passed = checks.filter(check => check[0]).length;
  $("#qualityScore").textContent = `${passed}/${checks.length}`;
  $("#qualityList").innerHTML = checks.map(([success, title, help]) => `<li class="${success ? "checked" : "warning"}"><span>${success ? "✓" : "!"}</span><div><strong>${escapeHTML(title)}</strong><small>${escapeHTML(success ? "Validated from the current report." : help)}</small></div></li>`).join("");
  $("#qualityHelp").textContent = passed === checks.length ? "All current report health checks pass." : "Review highlighted items before publication.";
}

const defaultSectionPlaceholder = "Add evidence, analysis or professional commentary for this section.";

function isMeaningfulExportSection(section) {
  const text = clean(htmlToText(section.content)).replace(/\s+/g, " ");
  return Boolean(text) && text.toLocaleLowerCase() !== defaultSectionPlaceholder.toLocaleLowerCase();
}

function exportableSections() {
  return state.sections.filter(isMeaningfulExportSection);
}

function reportAsText() {
  const data = getData();
  const lines = [data.title.toUpperCase(), `${state.reportType.toUpperCase()} · ${data.organization}${data.location ? ` · ${data.location}` : ""}`, "", `Prepared For: ${data.preparedFor || "Not specified"}`, `Prepared By: ${data.preparedBy || "Not specified"}`, `Organization: ${data.organization || "Not specified"}`, `Date: ${formatDate(data.consultationDate)}`, `Consultation Type: ${data.consultationType || "Not specified"}`, `Participants: ${data.participants || "Not specified"}`, "", "─".repeat(64)];
  exportableSections().forEach((section, index) => {
    const number = effectiveNumber(section, index);
    lines.push("", `${number ? `${number} ` : ""}${section.title}`.toUpperCase(), "", htmlToText(section.content));
  });
  lines.push("", "─".repeat(64), "Review this structured draft against the original consultation notes before sharing.");
  return lines.join("\n");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2700);
}

function selectTab(name) {
  const showNotes = name === "notes";
  $("#notesTab").classList.toggle("active", showNotes);
  $("#audioTab").classList.toggle("active", !showNotes);
  $("#notesTab").setAttribute("aria-selected", String(showNotes));
  $("#audioTab").setAttribute("aria-selected", String(!showNotes));
  $("#notesPanel").hidden = !showNotes;
  $("#audioPanel").hidden = showNotes;
}

function updateWordCount() {
  const count = clean(notes.value) ? clean(notes.value).split(/\s+/).length : 0;
  $("#wordCount").textContent = `${count} word${count === 1 ? "" : "s"}`;
}

function readTemplates() {
  try { return JSON.parse(localStorage.getItem(templateStorageKey) || "[]"); }
  catch { return []; }
}

function writeTemplates(templates) {
  try { localStorage.setItem(templateStorageKey, JSON.stringify(templates)); return true; }
  catch { showToast("Local template storage is unavailable in this browser."); return false; }
}

function updateBuiltInTemplateMetadata() {
  const metadata = builtInTemplateMetadata[$("#builtinTemplates").value];
  if (!metadata) return;
  $("#templateCategory").value = metadata.category;
  $("#templateDescription").value = metadata.description;
}

function refreshTemplateLibrary(selectedId = "") {
  const templates = readTemplates();
  savedTemplates.innerHTML = templates.length ? `<option value="">Select a template</option>${templates.map(template => `<option value="${escapeHTML(template.id)}">${escapeHTML(template.name)}</option>`).join("")}` : '<option value="">No saved templates</option>';
  savedTemplates.value = selectedId;
  const hasSelection = Boolean(savedTemplates.value);
  ["#loadTemplate", "#previewTemplate", "#renameTemplate", "#duplicateTemplate", "#deleteTemplate"].forEach(selector => { $(selector).disabled = !hasSelection; });
  if (!hasSelection) $("#templatePreview").hidden = true;
}

function saveTemplate() {
  const name = clean($("#templateName").value);
  if (!state.generated || !name) return;
  const templates = readTemplates();
  const existing = templates.find(template => template.name.toLowerCase() === name.toLowerCase());
  const template = {
    id: existing?.id || `template-${Date.now()}`,
    name,
    description: clean($("#templateDescription").value),
    category: $("#templateCategory").value,
    savedAt: existing?.savedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    reportType: state.reportType,
    numberingStyle: state.numberingStyle,
    sections: state.sections.map((section, index) => ({ number: effectiveNumber(section, index), title: section.title })),
    branding: { ...state.branding },
    layout: { ...state.layout },
    exportPreferences: { coverPage: state.layout.coverPage, tableOfContents: state.layout.tableOfContents, pageNumbers: state.layout.pageNumbers }
  };
  const updated = existing ? templates.map(item => item.id === existing.id ? template : item) : [...templates, template];
  if (!writeTemplates(updated)) return;
  refreshTemplateLibrary(template.id);
  $("#templateName").value = "";
  $("#templateDescription").value = "";
  saveTemplateButton.disabled = true;
  showToast(existing ? "Local template updated." : "Custom template saved in this browser.");
}

function loadTemplate() {
  const template = readTemplates().find(item => item.id === savedTemplates.value);
  if (!template) return;
  state.loadedTemplate = template;
  state.organisationTemplate = null;
  state.reportType = template.reportType;
  state.numberingStyle = template.numberingStyle;
  if (template.branding) state.branding = { ...state.branding, ...template.branding };
  if (template.layout) state.layout = { ...state.layout, ...template.layout };
  reportType.value = presets[template.reportType] ? template.reportType : "Custom";
  numberingStyle.value = state.numberingStyle;
  restoreBrandingControls();
  restoreLayoutControls();
  applyBranding();
  applyLayoutPreview();
  if (state.generated) {
    const existingContent = Object.fromEntries(state.sections.map(section => [section.title, section.content]));
    state.sections = template.sections.map(item => newSection(item.title, existingContent[item.title] || "<p>Add evidence, analysis or professional commentary for this section.</p>", item.number));
    renderHeader();
    renderSections();
  }
  showToast(`“${template.name}” loaded. ${state.generated ? "Report structure updated." : "Generate a draft to apply it."}`);
}

function previewTemplate() {
  const template = readTemplates().find(item => item.id === savedTemplates.value);
  if (!template) return;
  const preview = $("#templatePreview");
  const savedDate = template.savedAt ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(template.savedAt)) : "Legacy template";
  preview.innerHTML = `<h4>${escapeHTML(template.name)}</h4><p>${escapeHTML(template.description || "No description provided.")}</p><dl><dt>Category</dt><dd>${escapeHTML(template.category || "Custom")}</dd><dt>Saved</dt><dd>${escapeHTML(savedDate)}</dd><dt>Report type</dt><dd>${escapeHTML(template.reportType || "Custom")}</dd><dt>Numbering</dt><dd>${escapeHTML(template.numberingStyle || "automatic")}</dd><dt>Design</dt><dd>${template.branding ? "Branding and export settings included" : "Structure only (legacy)"}</dd></dl><ul>${(template.sections || []).map(section => `<li>${escapeHTML(section.number ? `${section.number} ${section.title}` : section.title)}</li>`).join("")}</ul>`;
  preview.hidden = false;
}

function renameTemplate() {
  const newName = clean($("#templateName").value);
  const templates = readTemplates();
  const template = templates.find(item => item.id === savedTemplates.value);
  if (!template) return;
  if (!newName) { $("#templateName").focus(); showToast("Enter the new template name, then choose Rename."); return; }
  template.name = newName;
  template.updatedAt = new Date().toISOString();
  if (!writeTemplates(templates)) return;
  $("#templateName").value = "";
  refreshTemplateLibrary(template.id);
  previewTemplate();
  showToast("Template renamed.");
}

function duplicateTemplate() {
  const templates = readTemplates();
  const template = templates.find(item => item.id === savedTemplates.value);
  if (!template) return;
  const copy = JSON.parse(JSON.stringify(template));
  copy.id = `template-${Date.now()}`;
  copy.name = clean($("#templateName").value) || `${template.name} Copy`;
  copy.savedAt = new Date().toISOString();
  copy.updatedAt = copy.savedAt;
  if (!writeTemplates([...templates, copy])) return;
  $("#templateName").value = "";
  refreshTemplateLibrary(copy.id);
  previewTemplate();
  showToast("Template duplicated locally.");
}

function removeTemplate() {
  const template = readTemplates().find(item => item.id === savedTemplates.value);
  if (!template) return;
  writeTemplates(readTemplates().filter(item => item.id !== template.id));
  refreshTemplateLibrary();
  $("#templatePreview").hidden = true;
  showToast(`“${template.name}” removed from this browser.`);
}

function organisationId(prefix = "organisation-template") {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function readOrganisationTemplates() {
  try {
    const templates = JSON.parse(localStorage.getItem(organisationTemplateStorageKey) || "[]");
    return Array.isArray(templates) ? templates : [];
  } catch { return []; }
}

function writeOrganisationTemplates(templates) {
  try {
    localStorage.setItem(organisationTemplateStorageKey, JSON.stringify(templates));
    return true;
  } catch {
    showToast("Organisation template storage is unavailable in this browser.");
    return false;
  }
}

function selectedOrganisationTemplate() {
  return readOrganisationTemplates().find(template => template.id === $("#organisationTemplates").value);
}

function updateOrganisationTemplateActions() {
  const template = selectedOrganisationTemplate();
  const selected = Boolean(template);
  $("#applyOrganisationTemplate").disabled = !selected || template?.status === "archived";
  ["#editOrganisationTemplate", "#renameOrganisationTemplate", "#duplicateOrganisationTemplate", "#deleteOrganisationTemplate"].forEach(selector => { $(selector).disabled = !selected; });
  $("#archiveOrganisationTemplate").disabled = !selected;
  $("#archiveOrganisationTemplate").textContent = template?.status === "archived" ? "Restore" : "Archive";
  const sourceName = template?.source?.fileName || "";
  $("#organisationTemplateSource").hidden = !sourceName;
  $("#organisationTemplateSourceName").textContent = sourceName;
}

function refreshOrganisationTemplateLibrary(selectedId = "") {
  const allTemplates = readOrganisationTemplates();
  const templates = showingArchivedOrganisationTemplates ? allTemplates : allTemplates.filter(template => template.status !== "archived");
  const select = $("#organisationTemplates");
  select.innerHTML = templates.length
    ? `<option value="">Select an organisation template</option>${templates.map(template => `<option value="${escapeHTML(template.id)}">${escapeHTML(template.name)}${template.status === "archived" ? " (Archived)" : ""}</option>`).join("")}`
    : `<option value="">${allTemplates.length ? "No active organisation templates" : "No organisation templates available yet."}</option>`;
  select.value = templates.some(template => template.id === selectedId) ? selectedId : "";
  $("#organisationTemplateCount").textContent = `(${allTemplates.length})`;
  $("#organisationTemplateEmpty").hidden = templates.length > 0;
  $("#organisationTemplateEmpty").textContent = allTemplates.length
    ? "No active organisation templates. Choose Show archived to restore one."
    : "No organisation templates available yet.";
  $("#toggleArchivedOrganisationTemplates").textContent = showingArchivedOrganisationTemplates ? "Hide archived" : "Show archived";
  updateOrganisationTemplateActions();
}

function renderOrganisationReviewSections() {
  const list = $("#organisationSectionList");
  const sections = organisationReviewState.sections;
  list.innerHTML = sections.map((section, index) => `
    <div class="organisation-section-row" data-organisation-section-id="${escapeHTML(section.id)}">
      <label class="sr-only" for="organisation-level-${escapeHTML(section.id)}">Heading level</label>
      <select id="organisation-level-${escapeHTML(section.id)}" data-organisation-field="level" aria-label="Heading level for ${escapeHTML(section.title || `section ${index + 1}`)}">
        ${Array.from({ length: 9 }, (_, levelIndex) => `<option value="${levelIndex + 1}" ${Number(section.level) === levelIndex + 1 ? "selected" : ""}>Heading ${levelIndex + 1}</option>`).join("")}
      </select>
      <label class="sr-only" for="organisation-title-${escapeHTML(section.id)}">Section title</label>
      <input id="organisation-title-${escapeHTML(section.id)}" data-organisation-field="title" value="${escapeHTML(section.title)}" maxlength="120" placeholder="Section title">
      <div class="organisation-row-controls" aria-label="Section controls">
        <button type="button" data-organisation-action="up" aria-label="Move section up" ${index === 0 ? "disabled" : ""}>↑</button>
        <button type="button" data-organisation-action="down" aria-label="Move section down" ${index === sections.length - 1 ? "disabled" : ""}>↓</button>
        <button type="button" class="remove" data-organisation-action="remove" aria-label="Remove section">×</button>
      </div>
    </div>`).join("");
  $("#organisationEmptyState").hidden = sections.length > 0;
}

function openOrganisationTemplateReview({ template = null, imported = null } = {}) {
  const source = imported?.source || template?.source || { format: "manual", importedAt: new Date().toISOString() };
  const inputSections = imported?.sections || template?.sections || [];
  organisationReviewState = {
    templateId: template?.id || "",
    source: { ...source },
    sections: inputSections.map((section, index) => ({
      id: section.id || organisationId("organisation-section"),
      title: section.title || "",
      level: Number(section.level || section.headingLevel) || 1,
      order: index,
      sourceStyleId: section.sourceStyleId || "",
      sourceStyleName: section.sourceStyleName || ""
    }))
  };
  $("#organisationTemplateName").value = template?.name || imported?.suggestedName || "";
  const count = organisationReviewState.sections.length;
  const fileName = source.fileName ? ` from ${source.fileName}` : "";
  const warnings = imported?.warnings?.length ? ` ${imported.warnings.join(" ")}` : "";
  $("#organisationImportSummary").textContent = count
    ? `${count} heading${count === 1 ? "" : "s"} detected${fileName}. Review the structure before saving.${warnings}`
    : `No headings were detected${fileName}. Add the approved sections manually before saving.${warnings}`;
  renderOrganisationReviewSections();
  const dialog = $("#organisationTemplateDialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  $("#organisationTemplateName").focus();
}

function closeOrganisationTemplateReview() {
  const dialog = $("#organisationTemplateDialog");
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
  organisationReviewState = { templateId: "", source: null, sections: [] };
}

function saveOrganisationTemplateReview() {
  const name = clean($("#organisationTemplateName").value);
  const sections = organisationReviewState.sections
    .map((section, index) => ({ ...section, title: clean(section.title), level: Math.min(9, Math.max(1, Number(section.level) || 1)), order: index }))
    .filter(section => section.title);
  if (!name) { $("#organisationTemplateName").focus(); showToast("Enter an organisation template name."); return; }
  if (!sections.length) { showToast("Add at least one section before saving."); return; }
  const templates = readOrganisationTemplates();
  const duplicate = templates.find(template => template.id !== organisationReviewState.templateId && template.name.toLowerCase() === name.toLowerCase());
  if (duplicate) { showToast("An organisation template with this name already exists."); return; }
  const existing = templates.find(template => template.id === organisationReviewState.templateId);
  const now = new Date().toISOString();
  const template = {
    schemaVersion: 1,
    id: existing?.id || organisationId(),
    kind: "organisation",
    name,
    status: existing?.status || "active",
    source: organisationReviewState.source || existing?.source || { format: "manual", importedAt: now },
    sections,
    capabilities: { structure: true, branding: false, headers: false, footers: false, disclaimers: false, ...(existing?.capabilities || {}) },
    extensions: existing?.extensions || {},
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  const updated = existing ? templates.map(item => item.id === existing.id ? template : item) : [...templates, template];
  if (!writeOrganisationTemplates(updated)) return;
  closeOrganisationTemplateReview();
  refreshOrganisationTemplateLibrary(template.id);
  showToast(existing ? "Organisation template updated." : "Organisation template saved locally.");
}

async function importOrganisationTemplate(file) {
  if (!file) return;
  try {
    showToast("Analysing the DOCX structure locally…");
    const importer = globalThis.TemplateImporters?.docx;
    if (!importer) throw new Error("The DOCX importer is unavailable.");
    const imported = await importer.analyze(file);
    openOrganisationTemplateReview({ imported });
  } catch (error) {
    showToast(error?.message || "The DOCX structure could not be read.");
  } finally {
    $("#organisationTemplateFile").value = "";
  }
}

function applyOrganisationTemplate() {
  const template = selectedOrganisationTemplate();
  if (!template || template.status === "archived") return;
  state.organisationTemplate = JSON.parse(JSON.stringify(template));
  state.loadedTemplate = null;
  state.reportType = "Custom";
  reportType.value = "Custom";
  if (state.generated) {
    const existingContent = Object.fromEntries(state.sections.map(section => [section.title, section.content]));
    state.sections = template.sections.map((item, index) => newSection(
      item.title,
      existingContent[item.title] || "<p>Add evidence, analysis or professional commentary for this section.</p>",
      String(index + 1).padStart(2, "0"),
      { headingLevel: item.level || 1, organisationSectionId: item.id || "" }
    ));
    renderHeader();
    renderSections();
  }
  showToast(`“${template.name}” applied. ${state.generated ? "Report structure updated." : "Generate a draft to use it."}`);
}

function editOrganisationTemplate() {
  const template = selectedOrganisationTemplate();
  if (template) openOrganisationTemplateReview({ template });
}

function renameOrganisationTemplate() {
  const template = selectedOrganisationTemplate();
  if (!template) return;
  const name = clean(window.prompt("Rename organisation template", template.name));
  if (!name || name === template.name) return;
  const templates = readOrganisationTemplates();
  if (templates.some(item => item.id !== template.id && item.name.toLowerCase() === name.toLowerCase())) { showToast("An organisation template with this name already exists."); return; }
  template.name = name;
  template.updatedAt = new Date().toISOString();
  if (!writeOrganisationTemplates(templates.map(item => item.id === template.id ? template : item))) return;
  refreshOrganisationTemplateLibrary(template.id);
  showToast("Organisation template renamed.");
}

function duplicateOrganisationTemplate() {
  const template = selectedOrganisationTemplate();
  if (!template) return;
  const now = new Date().toISOString();
  const copy = JSON.parse(JSON.stringify(template));
  copy.id = organisationId();
  copy.name = `${template.name} Copy`;
  copy.status = "active";
  copy.createdAt = now;
  copy.updatedAt = now;
  copy.sections = copy.sections.map((section, index) => ({ ...section, id: organisationId("organisation-section"), order: index }));
  if (!writeOrganisationTemplates([...readOrganisationTemplates(), copy])) return;
  if (showingArchivedOrganisationTemplates) showingArchivedOrganisationTemplates = false;
  refreshOrganisationTemplateLibrary(copy.id);
  showToast("Organisation template duplicated locally.");
}

function archiveOrganisationTemplate() {
  const template = selectedOrganisationTemplate();
  if (!template) return;
  template.status = template.status === "archived" ? "active" : "archived";
  template.updatedAt = new Date().toISOString();
  const templates = readOrganisationTemplates().map(item => item.id === template.id ? template : item);
  if (!writeOrganisationTemplates(templates)) return;
  const restored = template.status === "active";
  refreshOrganisationTemplateLibrary(restored || showingArchivedOrganisationTemplates ? template.id : "");
  showToast(restored ? "Organisation template restored." : "Organisation template archived. It can be restored later.");
}

function deleteOrganisationTemplate() {
  const template = selectedOrganisationTemplate();
  if (!template || !window.confirm(`Delete “${template.name}”? This cannot be undone.`)) return;
  if (!writeOrganisationTemplates(readOrganisationTemplates().filter(item => item.id !== template.id))) return;
  if (state.organisationTemplate?.id === template.id) state.organisationTemplate = null;
  refreshOrganisationTemplateLibrary();
  showToast("Organisation template deleted from this browser.");
}

function handleImageUpload(input, targetKey, fileNameSelector, removeSelector) {
  const file = input.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) { showToast("Choose a supported image file."); return; }
  if (file.size > 5 * 1024 * 1024) { showToast("Please choose an image smaller than 5 MB."); input.value = ""; return; }
  const reader = new FileReader();
  reader.onload = () => {
    state.branding[targetKey] = reader.result;
    state.branding[`${targetKey}Name`] = file.name;
    $(fileNameSelector).textContent = file.name;
    $(removeSelector).hidden = false;
    applyBranding();
    showToast(targetKey === "logo" ? "Logo added to the report preview." : "Image block added to the report preview.");
  };
  reader.readAsDataURL(file);
}

function removeImageAsset(targetKey, inputSelector, fileNameSelector, removeSelector, defaultText) {
  state.branding[targetKey] = "";
  state.branding[`${targetKey}Name`] = "";
  $(inputSelector).value = "";
  $(fileNameSelector).textContent = defaultText;
  $(removeSelector).hidden = true;
  applyBranding();
}

function safeFileName(value, fallback = "consultation-report") {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || fallback;
}

function downloadBlob(blob, fileName) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function serializeProject() {
  state.audio.transcript = $("#transcriptText").value;
  return {
    format: "consultation-report-assistant-project",
    version: 1,
    savedAt: new Date().toISOString(),
    consultation: getData(),
    report: {
      generated: state.generated,
      generatedAt: state.generatedAt,
      reportType: state.reportType,
      numberingStyle: state.numberingStyle,
      sections: state.sections.map(section => ({ number: section.number, title: section.title, content: section.content }))
    },
    branding: { ...state.branding },
    layout: { ...state.layout },
    audio: { ...state.audio }
  };
}

function saveProject() {
  const project = serializeProject();
  const name = safeFileName(project.consultation.title, "consultation-project");
  downloadBlob(new Blob([JSON.stringify(project, null, 2)], { type: "application/json;charset=utf-8" }), `${name}.consultation-project.json`);
  $("#projectNameDisplay").textContent = project.consultation.title || "Untitled local project";
  showToast("Complete project saved as a local JSON file.");
}

function setControlValue(selector, value) {
  const control = $(selector);
  if (!control) return;
  if (control.type === "checkbox") control.checked = Boolean(value);
  else control.value = value ?? "";
}

function restoreBrandingControls() {
  setControlValue("#fontFamily", state.branding.fontFamily);
  [["#fontColor", state.branding.fontColor], ["#backgroundColor", state.branding.backgroundColor], ["#accentColor", state.branding.accentColor]].forEach(([selector, value]) => {
    setControlValue(selector, value);
    $(selector).nextElementSibling.value = String(value).toUpperCase();
  });
  setControlValue("#watermarkEnabled", state.branding.watermarkEnabled);
  setControlValue("#watermarkText", state.branding.watermarkText);
  $("#logoFileName").textContent = state.branding.logoName || "PNG, JPG or SVG · local only";
  $("#imageFileName").textContent = state.branding.imageName || "Optional image block · local only";
  $("#removeLogo").hidden = !state.branding.logo;
  $("#removeImage").hidden = !state.branding.image;
}

function restoreLayoutControls() {
  const mapping = {
    coverPage: "#coverPageEnabled", tableOfContents: "#tocEnabled", pageNumbers: "#pageNumbersEnabled",
    headerText: "#headerText", headerOrganization: "#headerOrganization", headerDate: "#headerDate",
    footerText: "#footerText", footerOrganization: "#footerOrganization", footerDate: "#footerDate",
    confidentialityEnabled: "#confidentialityEnabled", confidentialityText: "#confidentialityText"
  };
  Object.entries(mapping).forEach(([key, selector]) => setControlValue(selector, state.layout[key]));
}

function formatFileSize(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderCorrectionRows(type) {
  const isName = type === "name";
  const key = isName ? "nameCorrections" : "organizationCorrections";
  const container = $(isName ? "#nameCorrections" : "#organizationCorrections");
  const items = state.audio[key] || [];
  container.innerHTML = items.length ? items.map(item => `<div class="correction-row" data-correction-id="${escapeHTML(item.id)}" data-correction-type="${type}"><input data-correction-field="original" value="${escapeHTML(item.original)}" placeholder="Original"><input data-correction-field="corrected" value="${escapeHTML(item.corrected)}" placeholder="Corrected"><button type="button" data-remove-correction aria-label="Remove correction">×</button></div>`).join("") : `<p>No ${isName ? "name" : "organization"} corrections added.</p>`;
}

function transcriptReady() {
  return Boolean(clean(state.audio.transcript) && state.audio.approved && state.audio.checks.names && state.audio.checks.organizations && state.audio.checks.quotes);
}

function updateTranscriptWorkflow() {
  const hasTranscript = Boolean(clean(state.audio.transcript));
  const ready = transcriptReady();
  $("#useTranscript").disabled = !hasTranscript;
  $("#generateFromTranscript").disabled = !ready;
  $("#transcriptReadiness").textContent = ready ? "Ready for report" : "Review required";
  $("#transcriptReadiness").classList.toggle("ready", ready);
  $("#flowReview").classList.toggle("complete", hasTranscript);
  $("#flowCorrections").classList.toggle("complete", state.audio.checks.names && state.audio.checks.organizations);
  $("#flowApproval").classList.toggle("complete", state.audio.approved);
  $("#flowReport").classList.toggle("complete", state.generated && hasTranscript && clean(notes.value) === clean(applyTranscriptCorrections(state.audio.transcript)));
}

function applyTranscriptCorrections(transcript) {
  let output = transcript;
  [...(state.audio.nameCorrections || []), ...(state.audio.organizationCorrections || [])].forEach(item => {
    if (!clean(item.original) || !clean(item.corrected)) return;
    const escaped = item.original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    output = output.replace(new RegExp(`\\b${escaped}\\b`, "gi"), item.corrected);
  });
  return output;
}

function renderAudioState() {
  const hasAudio = Boolean(state.audio.dataUrl);
  $("#audioFileCard").hidden = !hasAudio;
  $("#audioFileName").textContent = state.audio.name || "Audio file";
  $("#audioFileMeta").textContent = [formatFileSize(state.audio.size), state.audio.type || "Audio", state.audio.duration ? `${Math.round(state.audio.duration / 60)} min` : ""].filter(Boolean).join(" · ");
  if (hasAudio) {
    if ($("#audioPlayer").getAttribute("src") !== state.audio.dataUrl) $("#audioPlayer").src = state.audio.dataUrl;
  } else { $("#audioPlayer").removeAttribute("src"); $("#audioPlayer").load(); }
  $("#transcriptText").value = state.audio.transcript || "";
  setControlValue("#transcriptStatus", state.audio.status || "draft");
  setControlValue("#transcriptApproved", state.audio.approved);
  setControlValue("#transcriptReviewNotes", state.audio.reviewNotes || "");
  setControlValue("#namesReviewed", state.audio.checks?.names);
  setControlValue("#organizationsReviewed", state.audio.checks?.organizations);
  setControlValue("#quotesReviewed", state.audio.checks?.quotes);
  setControlValue("#transcriptReportTemplate", state.audio.reportTemplate || "Consultation Report");
  renderCorrectionRows("name");
  renderCorrectionRows("organization");
  updateTranscriptWorkflow();
}

function loadAudioFile(file) {
  if (!file || !file.type.startsWith("audio/")) { showToast("Choose a supported audio file."); return; }
  if (file.size > 25 * 1024 * 1024) { showToast("Choose an audio file smaller than 25 MB for this local prototype."); return; }
  const reader = new FileReader();
  reader.onload = () => {
    state.audio = { ...state.audio, name: file.name, size: file.size, type: file.type, dataUrl: reader.result };
    renderAudioState();
    $("#audioPlayer").onloadedmetadata = () => {
      state.audio.duration = Number.isFinite($("#audioPlayer").duration) ? $("#audioPlayer").duration : 0;
      renderAudioState();
    };
    showToast("Audio added locally. It has not been uploaded anywhere.");
  };
  reader.readAsDataURL(file);
}

function removeAudioFile() {
  state.audio = { ...state.audio, name: "", size: 0, type: "", duration: 0, dataUrl: "", transcript: state.audio.transcript || "" };
  $("#audioUpload").value = "";
  renderAudioState();
  showToast("Audio removed. The transcript has been retained.");
}

function loadProjectFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const project = JSON.parse(reader.result);
      if (project.format !== "consultation-report-assistant-project" || !project.consultation || !project.report) throw new Error("Invalid project");
      Object.entries(project.consultation).forEach(([name, value]) => {
        const control = form.elements.namedItem(name);
        if (control) control.value = value ?? "";
      });
      state.generated = Boolean(project.report.generated);
      state.generatedAt = project.report.generatedAt || project.savedAt || "";
      state.reportType = project.report.reportType || project.consultation.reportType || "Consultation Report";
      state.numberingStyle = project.report.numberingStyle || "automatic";
      state.sections = (project.report.sections || []).map((section, index) => newSection(section.title || "Untitled Section", section.content || "<p></p>", section.number || String(index + 1).padStart(2, "0")));
      state.loadedTemplate = null;
      state.organisationTemplate = null;
      state.branding = { ...state.branding, ...(project.branding || {}) };
      state.layout = { ...state.layout, ...(project.layout || {}) };
      state.audio = { ...state.audio, ...(project.audio || {}) };
      state.audio.checks = { names: false, organizations: false, quotes: false, ...(state.audio.checks || {}) };
      state.audio.nameCorrections = state.audio.nameCorrections || [];
      state.audio.organizationCorrections = state.audio.organizationCorrections || [];
      reportType.value = presets[state.reportType] ? state.reportType : "Custom";
      numberingStyle.value = state.numberingStyle;
      restoreBrandingControls();
      restoreLayoutControls();
      renderAudioState();
      updateWordCount();
      if (state.generated) showGeneratedReport(getData());
      else {
        $("#emptyReport").hidden = false;
        reportDocument.hidden = true;
        copyButton.disabled = true; downloadButton.disabled = true; docxButton.disabled = true; pdfButton.disabled = true;
      }
      $("#projectNameDisplay").textContent = project.consultation.title || file.name.replace(/\.json$/i, "");
      showToast("Project loaded. The complete workspace has been restored.");
    } catch {
      showToast("This file is not a valid Consultation Report Assistant project.");
    } finally {
      $("#projectFileInput").value = "";
    }
  };
  reader.readAsText(file);
}

function resetProfessionalState() {
  state.branding = { fontFamily: "Georgia, serif", fontColor: "#40525e", backgroundColor: "#ffffff", accentColor: "#12706a", logo: "", image: "", watermarkEnabled: false, watermarkText: "DRAFT", logoName: "", imageName: "" };
  state.layout = { coverPage: true, tableOfContents: false, pageNumbers: true, headerText: "", headerOrganization: true, headerDate: false, footerText: "", footerOrganization: false, footerDate: true, confidentialityEnabled: false, confidentialityText: "Confidential — for authorised recipients only" };
  state.audio = { name: "", size: 0, type: "", duration: 0, dataUrl: "", transcript: "", status: "draft", approved: false, nameCorrections: [], organizationCorrections: [], reviewNotes: "", checks: { names: false, organizations: false, quotes: false }, reportTemplate: "Consultation Report" };
  restoreBrandingControls(); restoreLayoutControls(); renderAudioState(); applyBranding(); applyLayoutPreview();
  $("#projectNameDisplay").textContent = "Untitled local project";
}

function xmlEscape(value) {
  return String(value ?? "").replace(/[<>&'\"]/g, character => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[character]);
}

function richTextBlocks(html) {
  const root = document.createElement("div");
  root.innerHTML = html;
  const inlineRuns = (node, inherited = {}) => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ? [{ text: node.textContent, ...inherited }] : [];
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    const tag = node.tagName.toLowerCase();
    const style = { ...inherited };
    if (tag === "strong" || tag === "b") style.bold = true;
    if (tag === "em" || tag === "i") style.italic = true;
    if (tag === "u") style.underline = true;
    if (tag === "br") return [{ text: "\n", ...style }];
    return [...node.childNodes].flatMap(child => inlineRuns(child, style));
  };
  const blocks = [];
  const addElement = element => {
    if (element.nodeType === Node.TEXT_NODE) {
      if (clean(element.textContent)) blocks.push({ type: "p", runs: [{ text: element.textContent }] });
      return;
    }
    if (element.nodeType !== Node.ELEMENT_NODE) return;
    const tag = element.tagName.toLowerCase();
    if (tag === "ul" || tag === "ol") {
      [...element.children].filter(child => child.tagName.toLowerCase() === "li").forEach(child => blocks.push({ type: tag === "ul" ? "bullet" : "number", runs: inlineRuns(child) }));
    } else if (tag === "blockquote") blocks.push({ type: "quote", runs: inlineRuns(element, { italic: true }) });
    else if (/^h[1-6]$/.test(tag)) blocks.push({ type: "heading", level: Number(tag[1]), runs: inlineRuns(element, { bold: true }) });
    else if (tag === "p" || tag === "div") blocks.push({ type: "p", runs: inlineRuns(element) });
    else blocks.push({ type: "p", runs: inlineRuns(element) });
  };
  [...root.childNodes].forEach(addElement);
  return blocks.length ? blocks : [{ type: "p", runs: [{ text: "" }] }];
}

function base64Bytes(dataUrl) {
  const encoded = String(dataUrl).split(",")[1] || "";
  const binary = atob(encoded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function loadImage(dataUrl, mime = "image/png", background = null) {
  return new Promise((resolve, reject) => {
    if (!dataUrl) { resolve(null); return; }
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      const context = canvas.getContext("2d");
      if (background) { context.fillStyle = background; context.fillRect(0, 0, canvas.width, canvas.height); }
      context.drawImage(image, 0, 0);
      const output = canvas.toDataURL(mime, .9);
      resolve({ bytes: base64Bytes(output), width: canvas.width, height: canvas.height, dataUrl: output });
    };
    image.onerror = reject;
    image.src = dataUrl;
  });
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(parts) {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  parts.forEach(part => { output.set(part, offset); offset += part.length; });
  return output;
}

function zipArchive(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  files.forEach(file => {
    const name = encoder.encode(file.name);
    const data = typeof file.data === "string" ? encoder.encode(file.data) : file.data;
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true); localView.setUint16(4, 20, true); localView.setUint16(6, 0, true); localView.setUint16(8, 0, true);
    localView.setUint16(10, dosTime, true); localView.setUint16(12, dosDate, true); localView.setUint32(14, crc, true); localView.setUint32(18, data.length, true); localView.setUint32(22, data.length, true); localView.setUint16(26, name.length, true); localView.setUint16(28, 0, true); local.set(name, 30);
    localParts.push(local, data);
    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true); centralView.setUint16(4, 20, true); centralView.setUint16(6, 20, true); centralView.setUint16(8, 0, true); centralView.setUint16(10, 0, true);
    centralView.setUint16(12, dosTime, true); centralView.setUint16(14, dosDate, true); centralView.setUint32(16, crc, true); centralView.setUint32(20, data.length, true); centralView.setUint32(24, data.length, true); centralView.setUint16(28, name.length, true); centralView.setUint16(30, 0, true); centralView.setUint16(32, 0, true); centralView.setUint16(34, 0, true); centralView.setUint16(36, 0, true); centralView.setUint32(38, 0, true); centralView.setUint32(42, offset, true); central.set(name, 46);
    centralParts.push(central);
    offset += local.length + data.length;
  });
  const central = concatBytes(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true); endView.setUint16(4, 0, true); endView.setUint16(6, 0, true); endView.setUint16(8, files.length, true); endView.setUint16(10, files.length, true); endView.setUint32(12, central.length, true); endView.setUint32(16, offset, true); endView.setUint16(20, 0, true);
  return concatBytes([...localParts, central, end]);
}

function docxRun(run, options = {}) {
  const properties = [run.bold || options.bold ? "<w:b/>" : "", run.italic ? "<w:i/>" : "", run.underline ? '<w:u w:val="single"/>' : "", options.color ? `<w:color w:val="${options.color}"/>` : "", options.size ? `<w:sz w:val="${options.size}"/>` : ""].join("");
  const text = String(run.text || "").split("\n").map((part, index) => `${index ? "<w:br/>" : ""}<w:t xml:space="preserve">${xmlEscape(part)}</w:t>`).join("");
  return `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ""}${text}</w:r>`;
}

function docxParagraph(runs, options = {}) {
  const pPr = [options.style ? `<w:pStyle w:val="${options.style}"/>` : "", options.center ? '<w:jc w:val="center"/>' : "", options.numId ? `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${options.numId}"/></w:numPr>` : "", options.pageBreakBefore ? '<w:pageBreakBefore/>' : ""].join("");
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${runs.map(run => docxRun(run, options)).join("")}</w:p>`;
}

function docxTocLink(text, anchor, color) {
  return `<w:p><w:hyperlink w:anchor="${anchor}" w:history="1"><w:r><w:rPr><w:color w:val="${color}"/><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:hyperlink></w:p>`;
}

function docxBookmarkedHeading(text, anchor, bookmarkId, color) {
  return `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:bookmarkStart w:id="${bookmarkId}" w:name="${anchor}"/>${docxRun({ text, bold: true }, { color })}<w:bookmarkEnd w:id="${bookmarkId}"/></w:p>`;
}

function docxDrawing(relId, name, width, height, maxWidthInches = 6.4) {
  const ratio = width / Math.max(height, 1);
  const displayWidth = Math.min(maxWidthInches, Math.max(1.5, width / 180));
  const displayHeight = Math.min(4.6, displayWidth / ratio);
  const cx = Math.round(displayWidth * 914400), cy = Math.round(displayHeight * 914400);
  return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="${xmlEscape(name)}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="${xmlEscape(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

async function buildDocx() {
  const data = getData();
  const sections = exportableSections();
  const accent = state.branding.accentColor.replace("#", "").toUpperCase();
  const color = state.branding.fontColor.replace("#", "").toUpperCase();
  const background = state.branding.backgroundColor.replace("#", "").toUpperCase();
  const wordFont = /Times/i.test(state.branding.fontFamily) ? "Times New Roman" : /Georgia/i.test(state.branding.fontFamily) ? "Georgia" : /Calibri/i.test(state.branding.fontFamily) ? "Calibri" : "Arial";
  const logo = await loadImage(state.branding.logo, "image/png").catch(() => null);
  const feature = await loadImage(state.branding.image, "image/png").catch(() => null);
  const relationships = [
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>',
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>',
    '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'
  ];
  if (logo) relationships.push('<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/>');
  if (feature) relationships.push(`<Relationship Id="rId${logo ? 6 : 5}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/report-image.png"/>`);
  let body = "";
  let nextOrderedNumId = 2;
  const orderedNumIds = [];
  if (state.layout.coverPage) {
    if (logo) body += docxDrawing("rId5", "Organization logo", logo.width, logo.height, 2.2);
    body += docxParagraph([{ text: state.reportType }], { center: true, color: accent, size: 22, bold: true });
    body += docxParagraph([{ text: data.title }], { center: true, color, size: 48, bold: true });
    body += docxParagraph([{ text: [data.organization, data.location].filter(Boolean).join(" · ") }], { center: true, color, size: 22 });
    [["Prepared for", data.preparedFor], ["Prepared by", data.preparedBy], ["Date", formatDate(data.consultationDate)], ["Consultation type", data.consultationType], ["Participants", data.participants]].forEach(([label, value]) => { body += docxParagraph([{ text: `${label}: `, bold: true }, { text: value || "Not specified" }], { center: true, color, size: 20 }); });
    body += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  } else {
    body += docxParagraph([{ text: data.title }], { style: "Title", color, bold: true });
  }
  if (feature) body += docxDrawing(`rId${logo ? 6 : 5}`, "Report image", feature.width, feature.height);
  if (state.layout.tableOfContents) {
    body += docxParagraph([{ text: "Table of Contents" }], { style: "Heading1", color: accent, bold: true });
    sections.forEach((section, index) => {
      const number = effectiveNumber(section, index);
      body += docxTocLink(`${number ? `${number} ` : ""}${section.title}`, `section_${index + 1}`, color);
    });
    body += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  }
  sections.forEach((section, index) => {
    const number = effectiveNumber(section, index);
    body += docxBookmarkedHeading(`${number ? `${number} ` : ""}${section.title}`, `section_${index + 1}`, index + 1, accent);
    let activeOrderedNumId = 0;
    let previousBlockType = "";
    richTextBlocks(section.content).forEach(block => {
      if (block.type === "number" && previousBlockType !== "number") {
        activeOrderedNumId = nextOrderedNumId++;
        orderedNumIds.push(activeOrderedNumId);
      }
      const options = { color, style: block.type === "heading" ? `Heading${Math.min(block.level || 2, 3)}` : block.type === "quote" ? "Quote" : "", numId: block.type === "bullet" ? 1 : block.type === "number" ? activeOrderedNumId : 0 };
      body += docxParagraph(block.runs, options);
      previousBlockType = block.type;
    });
  });
  const sectionProperties = '<w:sectPr><w:headerReference w:type="default" r:id="rId3"/><w:footerReference w:type="default" r:id="rId4"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567"/></w:sectPr>';
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:background w:color="${background}"/><w:body>${body}${sectionProperties}</w:body></w:document>`;
  const headerContent = [];
  const headerText = reportHeaderText(data);
  if (headerText) headerContent.push(docxParagraph([{ text: headerText }], { center: true, color, size: 16 }));
  if (state.branding.watermarkEnabled) headerContent.push(docxParagraph([{ text: state.branding.watermarkText || "DRAFT" }], { center: true, color: "D9D9D9", size: 64, bold: true }));
  const footerRuns = [{ text: reportFooterText(data) }];
  const pageField = state.layout.pageNumbers ? '<w:r><w:t xml:space="preserve">  ·  Page </w:t></w:r><w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple>' : "";
  const headerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${headerContent.join("")}</w:hdr>`;
  const footerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr>${docxRun(footerRuns[0], { color, size: 16 })}${pageField}</w:p></w:ftr>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="${wordFont}" w:hAnsi="${wordFont}"/><w:color w:val="${color}"/><w:sz w:val="22"/></w:rPr><w:pPr><w:spacing w:after="140" w:line="300" w:lineRule="auto"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="48"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:outlineLvl w:val="0"/><w:rPr><w:b/><w:color w:val="${accent}"/><w:sz w:val="34"/></w:rPr><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="160"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="560"/><w:shd w:fill="F4F1EA"/></w:pPr><w:rPr><w:i/></w:rPr></w:style></w:styles>`;
  const orderedAbstracts = orderedNumIds.map(numId => `<w:abstractNum w:abstractNumId="${numId}"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>`).join("");
  const orderedInstances = orderedNumIds.map(numId => `<w:num w:numId="${numId}"><w:abstractNumId w:val="${numId}"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`).join("");
  const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>${orderedAbstracts}<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>${orderedInstances}</w:numbering>`;
  const files = [
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
    { name: "_rels/.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>' },
    { name: "word/document.xml", data: documentXml }, { name: "word/styles.xml", data: stylesXml }, { name: "word/numbering.xml", data: numberingXml }, { name: "word/header1.xml", data: headerXml }, { name: "word/footer1.xml", data: footerXml },
    { name: "word/_rels/document.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.join("")}</Relationships>` },
    { name: "docProps/core.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(data.title)}</dc:title><dc:creator>${xmlEscape(data.preparedBy || data.organization)}</dc:creator><dc:subject>${xmlEscape(state.reportType)}</dc:subject><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>` },
    { name: "docProps/app.xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Consultation Report Assistant</Application></Properties>' }
  ];
  if (logo) files.push({ name: "word/media/logo.png", data: logo.bytes });
  if (feature) files.push({ name: "word/media/report-image.png", data: feature.bytes });
  return new Blob([zipArchive(files)], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

function pdfSafeText(value) {
  return String(value ?? "").normalize("NFKD").replace(/[“❝]/g, "\u0001").replace(/[”❞]/g, "\u0002").replace(/[‘’]/g, "'").replace(/[–—]/g, "-").replace(/…/g, "...").replace(/•/g, "-").replace(/\s*·\s*/g, ", ").replace(/[^\x20-\x7e\u0001\u0002]/g, "?").replace(/([\\()])/g, "\\$1").replace(/\u0001/g, "\\223").replace(/\u0002/g, "\\224");
}

function pdfBytes(value) {
  return Uint8Array.from(String(value), character => character.charCodeAt(0) & 0xff);
}

class PdfDocumentBuilder {
  constructor() { this.objects = [null]; }
  reserve() { this.objects.push(null); return this.objects.length - 1; }
  add(value) { this.objects.push(value); return this.objects.length - 1; }
  set(id, value) { this.objects[id] = value; }
  stream(content, dictionary = "") {
    const bytes = typeof content === "string" ? pdfBytes(content) : content;
    return concatBytes([pdfBytes(`<< /Length ${bytes.length}${dictionary ? ` ${dictionary}` : ""} >>\nstream\n`), bytes, pdfBytes("\nendstream")]);
  }
  build(rootId) {
    const parts = [pdfBytes("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")];
    const offsets = [0];
    let offset = parts[0].length;
    for (let id = 1; id < this.objects.length; id++) {
      offsets[id] = offset;
      const objectData = typeof this.objects[id] === "string" ? pdfBytes(this.objects[id]) : this.objects[id];
      const object = concatBytes([pdfBytes(`${id} 0 obj\n`), objectData, pdfBytes("\nendobj\n")]);
      parts.push(object); offset += object.length;
    }
    const xrefOffset = offset;
    let xref = `xref\n0 ${this.objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < this.objects.length; id++) xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
    xref += `trailer\n<< /Size ${this.objects.length} /Root ${rootId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    parts.push(pdfBytes(xref));
    return concatBytes(parts);
  }
}

function hexRgb(hex) {
  const value = String(hex || "#000000").replace("#", "");
  return [parseInt(value.slice(0, 2), 16) / 255, parseInt(value.slice(2, 4), 16) / 255, parseInt(value.slice(4, 6), 16) / 255].map(number => Number.isFinite(number) ? number : 0);
}

function pdfFontKey(style = {}) {
  if (style.bold && style.italic) return "F4";
  if (style.bold) return "F2";
  if (style.italic) return "F3";
  return "F1";
}

function estimatedTextWidth(text, size, style = {}) {
  const width = [...String(text)].reduce((sum, character) => {
    if (/\s/.test(character)) return sum + size * .25;
    if (/[.,;:'"`!|ilI]/.test(character)) return sum + size * .27;
    if (/[MW@#%]/.test(character)) return sum + size * .78;
    if (/[A-Z0-9]/.test(character)) return sum + size * .55;
    return sum + size * .47;
  }, 0);
  return width * (style.bold ? 1.04 : 1);
}

async function buildPdf() {
  const data = getData();
  const sections = exportableSections();
  const [red, green, blue] = hexRgb(state.branding.fontColor);
  const [accentRed, accentGreen, accentBlue] = hexRgb(state.branding.accentColor);
  const [backgroundRed, backgroundGreen, backgroundBlue] = hexRgb(state.branding.backgroundColor);
  const logo = await loadImage(state.branding.logo, "image/jpeg", "#ffffff").catch(() => null);
  const feature = await loadImage(state.branding.image, "image/jpeg", "#ffffff").catch(() => null);
  const pdf = new PdfDocumentBuilder();
  const catalogId = pdf.reserve(), pagesId = pdf.reserve();
  const serif = /Georgia|Times/i.test(state.branding.fontFamily);
  const fonts = serif ? ["Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic"] : ["Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique"];
  const fontIds = fonts.map(font => pdf.add(`<< /Type /Font /Subtype /Type1 /BaseFont /${font} /Encoding /WinAnsiEncoding >>`));
  const imageResources = {};
  if (logo) imageResources.ImLogo = pdf.add(pdf.stream(logo.bytes, `/Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`));
  if (feature) imageResources.ImFeature = pdf.add(pdf.stream(feature.bytes, `/Type /XObject /Subtype /Image /Width ${feature.width} /Height ${feature.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`));
  const pages = [];
  const sectionTargets = new Map();
  const pageWidth = 595, pageHeight = 842, margin = 58, contentWidth = pageWidth - margin * 2;
  let currentPage, y;
  const newPage = isCover => {
    currentPage = { commands: [], links: [], isCover };
    currentPage.commands.push(`${backgroundRed.toFixed(3)} ${backgroundGreen.toFixed(3)} ${backgroundBlue.toFixed(3)} rg 0 0 ${pageWidth} ${pageHeight} re f`);
    if (state.branding.watermarkEnabled) currentPage.commands.push(`q 0.90 0.90 0.90 rg 0.707 0.707 -0.707 0.707 120 365 cm BT /F2 52 Tf (${pdfSafeText(state.branding.watermarkText || "DRAFT")}) Tj ET Q`);
    pages.push(currentPage);
    y = isCover ? 755 : 782;
  };
  const ensureSpace = height => { if (y - height < 62) newPage(false); };
  const drawLine = (runs, options = {}) => {
    const size = options.size || 11;
    const lineHeight = options.lineHeight || size * 1.45;
    const indent = options.indent || 0;
    const maxWidth = contentWidth - indent;
    const tokens = [];
    runs.forEach(run => String(run.text || "").replace(/\s*·\s*/g, ", ").replace(/\s+/g, " ").split(/(\s+)/).filter(Boolean).forEach(text => tokens.push({ text, bold: run.bold || options.bold, italic: run.italic || options.italic, underline: run.underline })));
    const lines = [[]];
    let width = 0;
    tokens.forEach(token => {
      const tokenWidth = estimatedTextWidth(token.text, size, token);
      if (width + tokenWidth > maxWidth && lines[lines.length - 1].length && clean(token.text)) { lines.push([]); width = 0; }
      lines[lines.length - 1].push(token); width += tokenWidth;
    });
    ensureSpace(lines.length * lineHeight + (options.after || 5));
    const bounds = { pageIndex: pages.length - 1, x: margin + indent, top: y + 4, bottom: y - lines.length * lineHeight, width: maxWidth };
    lines.forEach((line, lineIndex) => {
      let lineWidth = line.reduce((sum, token) => sum + estimatedTextWidth(token.text, size, token), 0);
      let x = margin + indent;
      if (options.center) x = (pageWidth - lineWidth) / 2;
      if (options.right) x = pageWidth - margin - lineWidth;
      const baseline = y - lineIndex * lineHeight;
      const textColor = options.accent ? `${accentRed.toFixed(3)} ${accentGreen.toFixed(3)} ${accentBlue.toFixed(3)}` : `${red.toFixed(3)} ${green.toFixed(3)} ${blue.toFixed(3)}`;
      const textCommands = [`BT ${textColor} rg 1 0 0 1 ${x.toFixed(2)} ${baseline.toFixed(2)} Tm`];
      line.forEach(token => textCommands.push(`/${pdfFontKey(token)} ${size} Tf (${pdfSafeText(token.text)}) Tj`));
      textCommands.push("ET");
      currentPage.commands.push(textCommands.join(" "));
      line.forEach(token => {
        const tokenWidth = estimatedTextWidth(token.text, size, token);
        if (token.underline && clean(token.text)) currentPage.commands.push(`${red.toFixed(3)} ${green.toFixed(3)} ${blue.toFixed(3)} RG .6 w ${x.toFixed(2)} ${(baseline - 1.5).toFixed(2)} m ${(x + tokenWidth).toFixed(2)} ${(baseline - 1.5).toFixed(2)} l S`);
        x += tokenWidth;
      });
    });
    y -= lines.length * lineHeight + (options.after ?? 5);
    return bounds;
  };
  const drawImage = (resource, asset, maxWidth, maxHeight) => {
    if (!asset || !imageResources[resource]) return;
    const ratio = asset.width / asset.height;
    let width = maxWidth, height = width / ratio;
    if (height > maxHeight) { height = maxHeight; width = height * ratio; }
    ensureSpace(height + 15);
    const x = (pageWidth - width) / 2;
    currentPage.commands.push(`q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${(y - height).toFixed(2)} cm /${resource} Do Q`);
    y -= height + 15;
  };
  const drawBlocks = blocks => {
    let orderedIndex = 0;
    let previousBlockType = "";
    blocks.forEach(block => {
      if (block.type === "number" && previousBlockType !== "number") orderedIndex = 0;
      let runs = block.runs;
      const options = {};
      if (block.type === "bullet") { runs = [{ text: "- ", bold: true }, ...runs]; options.indent = 16; }
      if (block.type === "number") { orderedIndex += 1; runs = [{ text: `${orderedIndex}. `, bold: true }, ...runs]; options.indent = 16; }
      if (block.type === "quote") {
        runs = runs.map(run => ({ ...run }));
        let firstRun = runs.findIndex(run => clean(run.text));
        if (firstRun < 0) runs = [{ text: "“”" }];
        else {
          if (/^\s*["“❝]/.test(runs[firstRun].text)) runs[firstRun].text = runs[firstRun].text.replace(/^(\s*)["“❝]/, "$1“");
          else runs.unshift({ text: "“" });
          const lastRun = runs.map(run => clean(run.text)).lastIndexOf(runs.map(run => clean(run.text)).filter(Boolean).at(-1));
          if (/["”❞]\s*$/.test(runs[lastRun].text)) runs[lastRun].text = runs[lastRun].text.replace(/["”❞](\s*)$/, "”$1");
          else runs.push({ text: "”" });
        }
        options.indent = 20; options.italic = true; options.after = 14;
      }
      if (block.type === "heading") { options.size = block.level <= 2 ? 15 : 13; options.bold = true; options.after = 7; }
      drawLine(runs, options);
      previousBlockType = block.type;
    });
  };
  newPage(Boolean(state.layout.coverPage));
  if (state.layout.coverPage) {
    drawImage("ImLogo", logo, 150, 70);
    y -= 22;
    drawLine([{ text: state.reportType, bold: true }], { center: true, size: 11, accent: true, after: 18 });
    drawLine([{ text: data.title, bold: true }], { center: true, size: 27, after: 12 });
    drawLine([{ text: [data.organization, data.location].filter(Boolean).join(" · ") }], { center: true, size: 12, after: 30 });
    [["Prepared for", data.preparedFor], ["Prepared by", data.preparedBy], ["Date", formatDate(data.consultationDate)], ["Consultation type", data.consultationType], ["Participants", data.participants]].forEach(([label, value]) => drawLine([{ text: `${label}: `, bold: true }, { text: value || "Not specified" }], { center: true, size: 10, after: 4 }));
    drawImage("ImFeature", feature, 400, 180);
    newPage(false);
  } else {
    drawLine([{ text: data.title, bold: true }], { size: 25, accent: true, after: 14 });
    drawImage("ImFeature", feature, contentWidth, 200);
  }
  if (state.layout.tableOfContents) {
    drawLine([{ text: "Table of Contents", bold: true }], { size: 20, accent: true, after: 15 });
    sections.forEach((section, index) => {
      const number = effectiveNumber(section, index);
      const bounds = drawLine([{ text: `${number ? `${number}  ` : ""}${section.title}` }], { size: 11, after: 4 });
      pages[bounds.pageIndex].links.push({ ...bounds, sectionIndex: index });
    });
    newPage(false);
  }
  sections.forEach((section, index) => {
    ensureSpace(55);
    sectionTargets.set(index, { pageIndex: pages.length - 1, y: Math.min(pageHeight - 40, y + 12) });
    const number = effectiveNumber(section, index);
    drawLine([{ text: `${number ? `${number}  ` : ""}${section.title}`, bold: true }], { size: 18, accent: true, after: 12 });
    drawBlocks(richTextBlocks(section.content));
    y -= 12;
  });
  const headerText = reportHeaderText(data), footerText = reportFooterText(data);
  pages.forEach((page, index) => {
    const decorations = [];
    if (headerText && !page.isCover) decorations.push(`BT /F1 8 Tf ${red.toFixed(3)} ${green.toFixed(3)} ${blue.toFixed(3)} rg 1 0 0 1 ${margin} 814 Tm (${pdfSafeText(headerText)}) Tj ET ${accentRed.toFixed(3)} ${accentGreen.toFixed(3)} ${accentBlue.toFixed(3)} RG .7 w ${margin} 805 m ${pageWidth - margin} 805 l S`);
    if (footerText || state.layout.pageNumbers) {
      const pageLabel = state.layout.pageNumbers ? `Page ${index + 1} of ${pages.length}` : "";
      decorations.push(`${accentRed.toFixed(3)} ${accentGreen.toFixed(3)} ${accentBlue.toFixed(3)} RG .7 w ${margin} 39 m ${pageWidth - margin} 39 l S BT /F1 7 Tf ${red.toFixed(3)} ${green.toFixed(3)} ${blue.toFixed(3)} rg 1 0 0 1 ${margin} 25 Tm (${pdfSafeText(footerText)}) Tj ET BT /F1 7 Tf 1 0 0 1 ${pageWidth - margin - estimatedTextWidth(pageLabel, 7)} 25 Tm (${pdfSafeText(pageLabel)}) Tj ET`);
    }
    page.commands.push(...decorations);
  });
  const pageIds = pages.map(() => pdf.reserve());
  const xObjects = Object.entries(imageResources).map(([name, id]) => `/${name} ${id} 0 R`).join(" ");
  pages.forEach((page, index) => {
    const contentId = pdf.add(pdf.stream(page.commands.join("\n")));
    const annotationIds = page.links.flatMap(link => {
      const target = sectionTargets.get(link.sectionIndex);
      if (!target) return [];
      return [pdf.add(`<< /Type /Annot /Subtype /Link /Rect [${link.x.toFixed(2)} ${link.bottom.toFixed(2)} ${(link.x + link.width).toFixed(2)} ${link.top.toFixed(2)}] /Border [0 0 0] /Dest [${pageIds[target.pageIndex]} 0 R /XYZ null ${target.y.toFixed(2)} null] >>`)];
    });
    pdf.set(pageIds[index], `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontIds[0]} 0 R /F2 ${fontIds[1]} 0 R /F3 ${fontIds[2]} 0 R /F4 ${fontIds[3]} 0 R >>${xObjects ? ` /XObject << ${xObjects} >>` : ""} >> /Contents ${contentId} 0 R${annotationIds.length ? ` /Annots [${annotationIds.map(id => `${id} 0 R`).join(" ")}]` : ""} >>`);
  });
  pdf.set(pagesId, `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  pdf.set(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  return new Blob([pdf.build(catalogId)], { type: "application/pdf" });
}

form.addEventListener("submit", event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const data = getData();
  if (data.notes.length < 40) { notes.focus(); showToast("Add a little more detail to create a useful draft."); return; }
  state.reportType = data.reportType;
  if (!state.loadedTemplate) state.numberingStyle = numberingStyle.value || "automatic";
  state.sections = structureForGeneration(data, createBaseContent(data));
  state.generated = true;
  state.generatedAt = new Date().toISOString();
  setProgress("review");
  showGeneratedReport(data);
  showToast("Structured draft created. Every section can now be adapted.");
  $("#reportArea").scrollIntoView({ behavior: "smooth", block: "start" });
});

reportSections.addEventListener("input", event => {
  const sectionElement = event.target.closest("[data-section-id]");
  if (!sectionElement) return;
  const section = state.sections.find(item => item.id === sectionElement.dataset.sectionId);
  if (!section) return;
  if (event.target.dataset.field === "title") { section.title = event.target.value; renderTableOfContents(); }
  if (event.target.dataset.field === "number") section.number = event.target.value;
  if (event.target.dataset.field === "content") section.content = event.target.innerHTML;
  updateReportIntelligence();
});

reportSections.addEventListener("mousedown", event => {
  if (event.target.closest(".rich-tool")) event.preventDefault();
});

reportSections.addEventListener("click", event => {
  const tool = event.target.closest(".rich-tool");
  if (!tool) return;
  const sectionElement = tool.closest("[data-section-id]");
  const editor = sectionElement?.querySelector("[data-field='content']");
  const section = state.sections.find(item => item.id === sectionElement?.dataset.sectionId);
  if (!editor || !section) return;
  editor.focus();
  document.execCommand(tool.dataset.command, false, tool.dataset.value || null);
  section.content = editor.innerHTML;
  updateReportIntelligence();
});

reportSections.addEventListener("click", event => {
  const button = event.target.closest("[data-action]");
  const sectionElement = event.target.closest("[data-section-id]");
  if (!button || !sectionElement) return;
  const index = state.sections.findIndex(item => item.id === sectionElement.dataset.sectionId);
  if (button.dataset.action === "remove") {
    state.sections.splice(index, 1);
    showToast("Section removed from this report.");
  } else {
    const destination = button.dataset.action === "up" ? index - 1 : index + 1;
    if (destination < 0 || destination >= state.sections.length) return;
    [state.sections[index], state.sections[destination]] = [state.sections[destination], state.sections[index]];
  }
  renderSections();
});

$("#addSection").addEventListener("click", () => {
  state.sections.push(newSection("New Custom Section", "<p>Add evidence, analysis or professional commentary for this section.</p>", String(state.sections.length + 1).padStart(2, "0")));
  renderSections();
  const title = $$(".section-title-input").at(-1);
  title?.focus();
  title?.select();
  showToast("Custom section added.");
});

numberingStyle.addEventListener("change", () => {
  if (numberingStyle.value === "manual" && state.numberingStyle === "automatic") {
    state.sections.forEach((section, index) => { section.number = String(index + 1).padStart(2, "0"); });
  }
  state.numberingStyle = numberingStyle.value;
  renderSections();
  showToast(`Numbering changed to ${numberingStyle.options[numberingStyle.selectedIndex].text.toLowerCase()}.`);
});

reportType.addEventListener("change", () => {
  state.reportType = reportType.value;
  state.loadedTemplate = null;
  state.organisationTemplate = null;
  if (state.generated) {
    const data = getData();
    state.sections = structureForGeneration(data, createBaseContent(data));
    renderHeader(data);
    renderSections();
    showToast(`${state.reportType} structure applied. All sections remain editable.`);
  }
});

form.addEventListener("input", event => {
  if (state.generated && event.target !== notes && event.target !== reportType) { renderHeader(); applyLayoutPreview(); updateReportIntelligence(); }
});

copyButton.addEventListener("click", async () => {
  const text = reportAsText();
  try { await navigator.clipboard.writeText(text); }
  catch {
    const helper = document.createElement("textarea");
    helper.value = text; helper.style.position = "fixed"; helper.style.opacity = "0";
    document.body.appendChild(helper); helper.select(); document.execCommand("copy"); helper.remove();
  }
  setProgress("export");
  showToast("Full edited report copied to your clipboard.");
});

downloadButton.addEventListener("click", () => {
  const data = getData();
  downloadBlob(new Blob([reportAsText()], { type: "text/plain;charset=utf-8" }), `${safeFileName(data.title)}.txt`);
  setProgress("export");
  showToast("TXT report downloaded with the current section structure.");
});

docxButton.addEventListener("click", async () => {
  docxButton.disabled = true;
  showToast("Building editable Word report…");
  try {
    downloadBlob(await buildDocx(), `${safeFileName(getData().title)}.docx`);
    setProgress("export");
    showToast("DOCX report created with current content and branding.");
  } catch (error) {
    console.error("DOCX export failed", error);
    showToast("DOCX export could not be completed. Check uploaded image formats and try again.");
  } finally { docxButton.disabled = !state.generated; }
});

pdfButton.addEventListener("click", async () => {
  pdfButton.disabled = true;
  showToast("Building publication-ready PDF…");
  try {
    downloadBlob(await buildPdf(), `${safeFileName(getData().title)}.pdf`);
    setProgress("export");
    showToast("PDF report created from the current workspace.");
  } catch (error) {
    console.error("PDF export failed", error);
    showToast("PDF export could not be completed. Check uploaded image formats and try again.");
  } finally { pdfButton.disabled = !state.generated; }
});

$("#clearButton").addEventListener("click", () => {
  form.reset();
  [...form.elements].forEach(element => { if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") element.value = ""; });
  reportType.value = "Consultation Report";
  state.generated = false; state.generatedAt = ""; state.reportType = "Consultation Report"; state.numberingStyle = "automatic"; state.sections = []; state.loadedTemplate = null; state.organisationTemplate = null;
  numberingStyle.value = "automatic";
  selectTab("notes"); updateWordCount();
  $("#emptyReport").hidden = false; reportDocument.hidden = true; reportSections.innerHTML = "";
  copyButton.disabled = true; downloadButton.disabled = true; docxButton.disabled = true; pdfButton.disabled = true; saveTemplateButton.disabled = true;
  $("#draftStatus").classList.remove("ready"); $("#draftStatus").innerHTML = "<i></i> Waiting for consultation input";
  updateReportIntelligence();
  setProgress("input"); $("#title").focus(); showToast("Form cleared. Saved templates remain available.");
});

$("#saveProjectButton").addEventListener("click", saveProject);
$("#projectFileInput").addEventListener("change", event => loadProjectFile(event.target.files?.[0]));
$("#newProjectButton").addEventListener("click", () => {
  if (!window.confirm("Start a new project? Save the current project first if you want to keep it.")) return;
  $("#clearButton").click();
  resetProfessionalState();
  showToast("New local project ready.");
});

$("#notesTab").addEventListener("click", () => selectTab("notes"));
$("#audioTab").addEventListener("click", () => selectTab("audio"));
notes.addEventListener("input", updateWordCount);
$("#audioUpload").addEventListener("change", event => loadAudioFile(event.target.files?.[0]));
$("#removeAudio").addEventListener("click", removeAudioFile);
$("#transcriptText").addEventListener("input", event => { state.audio.transcript = event.target.value; updateTranscriptWorkflow(); });
$("#useTranscript").addEventListener("click", () => {
  notes.value = state.audio.transcript;
  updateWordCount();
  selectTab("notes");
  notes.focus();
  showToast("Transcript copied into consultation notes and ready for report generation.");
});
$("#transcriptStatus").addEventListener("change", event => { state.audio.status = event.target.value; state.audio.approved = event.target.value === "approved"; $("#transcriptApproved").checked = state.audio.approved; updateTranscriptWorkflow(); });
$("#transcriptApproved").addEventListener("change", event => { state.audio.approved = event.target.checked; state.audio.status = event.target.checked ? "approved" : "review"; $("#transcriptStatus").value = state.audio.status; updateTranscriptWorkflow(); });
$("#transcriptReviewNotes").addEventListener("input", event => { state.audio.reviewNotes = event.target.value; });
[["#namesReviewed", "names"], ["#organizationsReviewed", "organizations"], ["#quotesReviewed", "quotes"]].forEach(([selector, key]) => {
  $(selector).addEventListener("change", event => { state.audio.checks[key] = event.target.checked; updateTranscriptWorkflow(); });
});
$("#transcriptReportTemplate").addEventListener("change", event => { state.audio.reportTemplate = event.target.value; });

function addCorrection(type) {
  const key = type === "name" ? "nameCorrections" : "organizationCorrections";
  state.audio[key].push({ id: `correction-${Date.now()}-${Math.random().toString(16).slice(2)}`, original: "", corrected: "" });
  renderCorrectionRows(type);
}

$("#addNameCorrection").addEventListener("click", () => addCorrection("name"));
$("#addOrganizationCorrection").addEventListener("click", () => addCorrection("organization"));
[$("#nameCorrections"), $("#organizationCorrections")].forEach(container => {
  container.addEventListener("input", event => {
    const row = event.target.closest("[data-correction-id]");
    if (!row || !event.target.dataset.correctionField) return;
    const key = row.dataset.correctionType === "name" ? "nameCorrections" : "organizationCorrections";
    const item = state.audio[key].find(correction => correction.id === row.dataset.correctionId);
    if (item) item[event.target.dataset.correctionField] = event.target.value;
  });
  container.addEventListener("click", event => {
    const button = event.target.closest("[data-remove-correction]");
    const row = event.target.closest("[data-correction-id]");
    if (!button || !row) return;
    const key = row.dataset.correctionType === "name" ? "nameCorrections" : "organizationCorrections";
    state.audio[key] = state.audio[key].filter(item => item.id !== row.dataset.correctionId);
    renderCorrectionRows(row.dataset.correctionType);
  });
});

$("#generateFromTranscript").addEventListener("click", () => {
  if (!transcriptReady()) { showToast("Approve the transcript and complete all review checks first."); return; }
  notes.value = applyTranscriptCorrections(state.audio.transcript);
  reportType.value = state.audio.reportTemplate;
  state.reportType = state.audio.reportTemplate;
  state.loadedTemplate = null;
  state.organisationTemplate = null;
  updateWordCount();
  selectTab("notes");
  form.requestSubmit();
  updateTranscriptWorkflow();
});

$("#fontFamily").addEventListener("change", event => { state.branding.fontFamily = event.target.value; applyBranding(); });
[["#fontColor", "fontColor"], ["#backgroundColor", "backgroundColor"], ["#accentColor", "accentColor"]].forEach(([selector, key]) => {
  $(selector).addEventListener("input", event => { state.branding[key] = event.target.value; event.target.nextElementSibling.value = event.target.value.toUpperCase(); applyBranding(); });
});
$("#watermarkEnabled").addEventListener("change", event => { state.branding.watermarkEnabled = event.target.checked; applyBranding(); });
$("#watermarkText").addEventListener("input", event => { state.branding.watermarkText = event.target.value; applyBranding(); });
$("#logoUpload").addEventListener("change", event => handleImageUpload(event.target, "logo", "#logoFileName", "#removeLogo"));
$("#imageUpload").addEventListener("change", event => handleImageUpload(event.target, "image", "#imageFileName", "#removeImage"));
$("#removeLogo").addEventListener("click", () => removeImageAsset("logo", "#logoUpload", "#logoFileName", "#removeLogo", "PNG, JPG or SVG · local only"));
$("#removeImage").addEventListener("click", () => removeImageAsset("image", "#imageUpload", "#imageFileName", "#removeImage", "Optional image block · local only"));

const layoutControlMap = {
  "#coverPageEnabled": "coverPage", "#tocEnabled": "tableOfContents", "#pageNumbersEnabled": "pageNumbers",
  "#headerText": "headerText", "#headerOrganization": "headerOrganization", "#headerDate": "headerDate",
  "#footerText": "footerText", "#footerOrganization": "footerOrganization", "#footerDate": "footerDate",
  "#confidentialityEnabled": "confidentialityEnabled", "#confidentialityText": "confidentialityText"
};
Object.entries(layoutControlMap).forEach(([selector, key]) => {
  $(selector).addEventListener("input", event => { state.layout[key] = event.target.type === "checkbox" ? event.target.checked : event.target.value; applyLayoutPreview(); });
});

$("#templateName").addEventListener("input", event => { saveTemplateButton.disabled = !state.generated || !clean(event.target.value); });
$("#builtinTemplates").addEventListener("change", updateBuiltInTemplateMetadata);
saveTemplateButton.addEventListener("click", saveTemplate);
savedTemplates.addEventListener("change", () => { const enabled = Boolean(savedTemplates.value); ["#loadTemplate", "#previewTemplate", "#renameTemplate", "#duplicateTemplate", "#deleteTemplate"].forEach(selector => { $(selector).disabled = !enabled; }); $("#templatePreview").hidden = true; });
$("#loadTemplate").addEventListener("click", loadTemplate);
$("#previewTemplate").addEventListener("click", previewTemplate);
$("#renameTemplate").addEventListener("click", renameTemplate);
$("#duplicateTemplate").addEventListener("click", duplicateTemplate);
$("#deleteTemplate").addEventListener("click", removeTemplate);
$("#organisationTemplates").addEventListener("change", updateOrganisationTemplateActions);
$("#organisationTemplateFile").addEventListener("change", event => importOrganisationTemplate(event.target.files?.[0]));
$("#applyOrganisationTemplate").addEventListener("click", applyOrganisationTemplate);
$("#editOrganisationTemplate").addEventListener("click", editOrganisationTemplate);
$("#renameOrganisationTemplate").addEventListener("click", renameOrganisationTemplate);
$("#duplicateOrganisationTemplate").addEventListener("click", duplicateOrganisationTemplate);
$("#archiveOrganisationTemplate").addEventListener("click", archiveOrganisationTemplate);
$("#deleteOrganisationTemplate").addEventListener("click", deleteOrganisationTemplate);
$("#toggleArchivedOrganisationTemplates").addEventListener("click", () => {
  showingArchivedOrganisationTemplates = !showingArchivedOrganisationTemplates;
  refreshOrganisationTemplateLibrary();
});
$("#closeOrganisationDialog").addEventListener("click", closeOrganisationTemplateReview);
$("#cancelOrganisationTemplate").addEventListener("click", closeOrganisationTemplateReview);
$("#saveOrganisationTemplate").addEventListener("click", saveOrganisationTemplateReview);
$("#addOrganisationSection").addEventListener("click", () => {
  organisationReviewState.sections.push({ id: organisationId("organisation-section"), title: "New Section", level: 1, order: organisationReviewState.sections.length, sourceStyleId: "", sourceStyleName: "" });
  renderOrganisationReviewSections();
  const input = $$("#organisationSectionList [data-organisation-field='title']").at(-1);
  input?.focus();
  input?.select();
});
$("#organisationSectionList").addEventListener("input", event => {
  const row = event.target.closest("[data-organisation-section-id]");
  const field = event.target.dataset.organisationField;
  const section = organisationReviewState.sections.find(item => item.id === row?.dataset.organisationSectionId);
  if (!section || !field) return;
  section[field] = field === "level" ? Number(event.target.value) : event.target.value;
});
$("#organisationSectionList").addEventListener("change", event => {
  const row = event.target.closest("[data-organisation-section-id]");
  const section = organisationReviewState.sections.find(item => item.id === row?.dataset.organisationSectionId);
  if (section && event.target.dataset.organisationField === "level") section.level = Number(event.target.value);
});
$("#organisationSectionList").addEventListener("click", event => {
  const button = event.target.closest("[data-organisation-action]");
  const row = event.target.closest("[data-organisation-section-id]");
  if (!button || !row) return;
  const index = organisationReviewState.sections.findIndex(item => item.id === row.dataset.organisationSectionId);
  if (index < 0) return;
  if (button.dataset.organisationAction === "remove") organisationReviewState.sections.splice(index, 1);
  else {
    const destination = button.dataset.organisationAction === "up" ? index - 1 : index + 1;
    if (destination < 0 || destination >= organisationReviewState.sections.length) return;
    [organisationReviewState.sections[index], organisationReviewState.sections[destination]] = [organisationReviewState.sections[destination], organisationReviewState.sections[index]];
  }
  organisationReviewState.sections.forEach((section, order) => { section.order = order; });
  renderOrganisationReviewSections();
});
$("#applyBuiltinTemplate").addEventListener("click", () => {
  const selectedTemplate = $("#builtinTemplates").value;
  reportType.value = selectedTemplate;
  state.reportType = selectedTemplate;
  state.loadedTemplate = null;
  state.organisationTemplate = null;
  if (state.generated) {
    const existingContent = Object.fromEntries(state.sections.map(section => [section.title, section.content]));
    const baseContent = createBaseContent(getData());
    state.sections = presets[selectedTemplate].map((title, index) => newSection(title, existingContent[title] || baseContent[title] || "<p>Add evidence, analysis or professional commentary for this section.</p>", String(index + 1).padStart(2, "0")));
    renderHeader();
    renderSections();
  }
  showToast(`${selectedTemplate} applied. Every section remains editable.`);
});

updateWordCount();
updateBuiltInTemplateMetadata();
refreshTemplateLibrary();
refreshOrganisationTemplateLibrary();
applyBranding();
restoreLayoutControls();
renderAudioState();
applyLayoutPreview();
