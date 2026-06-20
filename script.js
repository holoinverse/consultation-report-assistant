"use strict";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const templateStorageKey = "consultation-report-assistant.templates.v1";
let sectionSequence = 0;

const form = $("#consultationForm");
const notes = $("#notes");
const reportDocument = $("#reportDocument");
const reportSections = $("#reportSections");
const reportType = $("#reportType");
const numberingStyle = $("#numberingStyle");
const copyButton = $("#copyButton");
const downloadButton = $("#downloadButton");
const saveTemplateButton = $("#saveTemplate");
const savedTemplates = $("#savedTemplates");
const toast = $("#toast");

const presets = {
  "Consultation Report": ["Executive Summary", "Key Findings", "Main Themes", "Community Feedback", "Recommendations", "Action Items", "Key Quotes", "Next Steps"],
  "Policy Brief": ["Executive Summary", "Policy Context", "Evidence and Findings", "Policy Options", "Recommendations", "Implementation Considerations", "Next Steps"],
  "Submission": ["Executive Summary", "About the Organization", "Consultation Context", "Key Issues", "Evidence", "Recommendations", "Conclusion"],
  "Internal Summary": ["Purpose", "Consultation Overview", "Key Findings", "Risks", "Decisions Required", "Action Items", "Next Steps"],
  "Workshop Summary": ["Workshop Overview", "Participants", "Discussion Themes", "Community Priorities", "Key Quotes", "Agreed Actions", "Next Steps"],
  "Community Engagement Report": ["Executive Summary", "Engagement Approach", "Who We Heard From", "Main Themes", "Stakeholder Feedback", "Community Priorities", "Recommendations", "Next Steps"],
  "Custom": ["Executive Summary", "New Section"]
};

const state = {
  generated: false,
  reportType: "Consultation Report",
  numberingStyle: "automatic",
  sections: [],
  loadedTemplate: null,
  branding: {
    fontFamily: "Georgia, serif",
    fontColor: "#40525e",
    backgroundColor: "#ffffff",
    accentColor: "#12706a",
    logo: "",
    image: "",
    watermarkEnabled: false,
    watermarkText: "DRAFT"
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
    "Main Themes": `<ul>${themes}</ul>`,
    "Discussion Themes": `<ul>${themes}</ul>`,
    "Community Feedback": `<p>Feedback reflected appreciation for existing community strengths and a clear expectation of practical follow-through. Participants emphasised accessible, responsive and community-led implementation.</p>${evidence.slice(0, 2).map(item => `<p>${escapeHTML(sentenceCase(item))}</p>`).join("")}`,
    "Stakeholder Feedback": `<ul>${evidenceList}</ul>`,
    "Community Priorities": `<ol>${priorityList}</ol>`,
    "Recommendations": `<ol>${priorityList || "<li>Validate the emerging priorities with participants and relevant decision-makers.</li><li>Develop an implementation plan with clear ownership and timeframes.</li>"}</ol>`,
    "Policy Options": `<ol>${priorityList}</ol>`,
    "Action Items": `<ol>${actionsList}</ol>`,
    "Agreed Actions": `<ol>${actionsList}</ol>`,
    "Key Quotes": quotes.length ? quotes.slice(0, 5).map(quote => `<blockquote>“${escapeHTML(quote)}”</blockquote>`).join("") : "<p>No verified direct quotations were identified in the source notes.</p>",
    "Next Steps": `<ol><li>Review this draft against the original notes for accuracy and balance.</li><li>Confirm priorities, responsibilities and delivery timeframes.</li>${followUp[0] ? `<li>${escapeHTML(sentenceCase(followUp[0]))}</li>` : "<li>Provide participants with an update on decisions and planned actions.</li>"}<li>Document progress and return to the community with outcomes.</li></ol>`,
    "Consultation Overview": `<p>${escapeHTML(data.title)} was conducted as a ${escapeHTML(data.consultationType.toLowerCase())}${data.location ? ` in ${escapeHTML(data.location)}` : ""}${data.participants ? ` with ${escapeHTML(data.participants)}` : ""}.</p>`,
    "Consultation Context": `<p>${escapeHTML(data.title)} provided a structured opportunity to understand community experience, priorities and expectations.</p>`,
    "Workshop Overview": `<p>The workshop brought together ${escapeHTML(data.participants || "participants")} to discuss priorities, opportunities and practical next steps.</p>`,
    "Participants": `<p>${escapeHTML(data.participants || "Participant details were not specified.")}</p>`,
    "Who We Heard From": `<p>${escapeHTML(data.participants || "Participant details were not specified.")}</p>`,
    "Engagement Approach": `<p>The engagement used a ${escapeHTML(data.consultationType.toLowerCase())} format to gather qualitative feedback and identify shared priorities.</p>`,
    "Key Issues": `<ul>${evidenceList}</ul>`,
    "Evidence": `<ul>${evidenceList}</ul>`,
    "Risks": `<p>Key delivery risks should be reviewed with responsible teams, including access barriers, unclear ownership, insufficient follow-through and limited communication with participants.</p>`,
    "Decisions Required": `<ol>${priorityList}</ol>`,
    "Implementation Considerations": `<p>Implementation should define clear ownership, realistic timeframes, accessible communication and a process for reporting progress to participants.</p>`,
    "About the Organization": `<p>${escapeHTML(data.organization)} commissioned or prepared this report to support transparent, evidence-informed engagement and decision-making.</p>`,
    "Conclusion": `<p>The consultation provides a practical foundation for action. Timely decisions, transparent communication and continued community involvement will be important to maintaining trust.</p>`
  };
}

function newSection(title, content, number) {
  return { id: `section-${Date.now()}-${++sectionSequence}`, number: String(number), title, content };
}

function structureForGeneration(data, contentMap) {
  const structure = state.loadedTemplate?.sections || presets[data.reportType] || presets.Custom;
  return structure.map((item, index) => {
    const title = typeof item === "string" ? item : item.title;
    const number = typeof item === "string" ? String(index + 1).padStart(2, "0") : item.number;
    return newSection(title, contentMap[title] || "<p>Add evidence, analysis or professional commentary for this section.</p>", number);
  });
}

function effectiveNumber(section, index) {
  if (state.numberingStyle === "none") return "";
  if (state.numberingStyle === "automatic") return String(index + 1).padStart(2, "0");
  return section.number;
}

function renderSections() {
  reportSections.innerHTML = state.sections.map((section, index) => `
    <section class="report-section" data-section-id="${section.id}">
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
      <div class="editable-content" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Edit ${escapeHTML(section.title)} content" data-field="content">${section.content}</div>
    </section>`).join("");
  numberingStyle.value = state.numberingStyle;
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

function showGeneratedReport(data) {
  renderHeader(data);
  renderSections();
  applyBranding();
  $("#emptyReport").hidden = true;
  reportDocument.hidden = false;
  copyButton.disabled = false;
  downloadButton.disabled = false;
  saveTemplateButton.disabled = !clean($("#templateName").value);
  $("#draftStatus").classList.add("ready");
  $("#draftStatus").innerHTML = "<i></i> Draft ready for professional review";
  $$(".quality-list li").forEach(item => item.classList.add("checked"));
  $("#qualityScore").textContent = "4/4";
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

function reportAsText() {
  const data = getData();
  const lines = [data.title.toUpperCase(), `${state.reportType.toUpperCase()} · ${data.organization}${data.location ? ` · ${data.location}` : ""}`, "", `Prepared For: ${data.preparedFor || "Not specified"}`, `Prepared By: ${data.preparedBy || "Not specified"}`, `Organization: ${data.organization || "Not specified"}`, `Date: ${formatDate(data.consultationDate)}`, `Consultation Type: ${data.consultationType || "Not specified"}`, `Participants: ${data.participants || "Not specified"}`, "", "─".repeat(64)];
  state.sections.forEach((section, index) => {
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

function refreshTemplateLibrary(selectedId = "") {
  const templates = readTemplates();
  savedTemplates.innerHTML = templates.length ? `<option value="">Select a template</option>${templates.map(template => `<option value="${escapeHTML(template.id)}">${escapeHTML(template.name)}</option>`).join("")}` : '<option value="">No saved templates</option>';
  savedTemplates.value = selectedId;
  const hasSelection = Boolean(savedTemplates.value);
  $("#loadTemplate").disabled = !hasSelection;
  $("#deleteTemplate").disabled = !hasSelection;
}

function saveTemplate() {
  const name = clean($("#templateName").value);
  if (!state.generated || !name) return;
  const templates = readTemplates();
  const existing = templates.find(template => template.name.toLowerCase() === name.toLowerCase());
  const template = {
    id: existing?.id || `template-${Date.now()}`,
    name,
    reportType: state.reportType,
    numberingStyle: state.numberingStyle,
    sections: state.sections.map((section, index) => ({ number: effectiveNumber(section, index), title: section.title }))
  };
  const updated = existing ? templates.map(item => item.id === existing.id ? template : item) : [...templates, template];
  if (!writeTemplates(updated)) return;
  refreshTemplateLibrary(template.id);
  $("#templateName").value = "";
  saveTemplateButton.disabled = true;
  showToast(existing ? "Local template updated." : "Custom template saved in this browser.");
}

function loadTemplate() {
  const template = readTemplates().find(item => item.id === savedTemplates.value);
  if (!template) return;
  state.loadedTemplate = template;
  state.reportType = template.reportType;
  state.numberingStyle = template.numberingStyle;
  reportType.value = presets[template.reportType] ? template.reportType : "Custom";
  numberingStyle.value = state.numberingStyle;
  if (state.generated) {
    const existingContent = Object.fromEntries(state.sections.map(section => [section.title, section.content]));
    state.sections = template.sections.map(item => newSection(item.title, existingContent[item.title] || "<p>Add evidence, analysis or professional commentary for this section.</p>", item.number));
    renderHeader();
    renderSections();
  }
  showToast(`“${template.name}” loaded. ${state.generated ? "Report structure updated." : "Generate a draft to apply it."}`);
}

function removeTemplate() {
  const template = readTemplates().find(item => item.id === savedTemplates.value);
  if (!template) return;
  writeTemplates(readTemplates().filter(item => item.id !== template.id));
  refreshTemplateLibrary();
  showToast(`“${template.name}” removed from this browser.`);
}

function handleImageUpload(input, targetKey, fileNameSelector, removeSelector) {
  const file = input.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) { showToast("Choose a supported image file."); return; }
  if (file.size > 5 * 1024 * 1024) { showToast("Please choose an image smaller than 5 MB."); input.value = ""; return; }
  const reader = new FileReader();
  reader.onload = () => {
    state.branding[targetKey] = reader.result;
    $(fileNameSelector).textContent = file.name;
    $(removeSelector).hidden = false;
    applyBranding();
    showToast(targetKey === "logo" ? "Logo added to the report preview." : "Image block added to the report preview.");
  };
  reader.readAsDataURL(file);
}

function removeImageAsset(targetKey, inputSelector, fileNameSelector, removeSelector, defaultText) {
  state.branding[targetKey] = "";
  $(inputSelector).value = "";
  $(fileNameSelector).textContent = defaultText;
  $(removeSelector).hidden = true;
  applyBranding();
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
  if (event.target.dataset.field === "title") section.title = event.target.value;
  if (event.target.dataset.field === "number") section.number = event.target.value;
  if (event.target.dataset.field === "content") section.content = event.target.innerHTML;
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
  if (state.generated) {
    const data = getData();
    state.sections = structureForGeneration(data, createBaseContent(data));
    renderHeader(data);
    renderSections();
    showToast(`${state.reportType} structure applied. All sections remain editable.`);
  }
});

form.addEventListener("input", event => {
  if (state.generated && event.target !== notes && event.target !== reportType) renderHeader();
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
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([reportAsText()], { type: "text/plain;charset=utf-8" }));
  link.download = `${(data.title || "consultation-report").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.txt`;
  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(link.href);
  setProgress("export");
  showToast("TXT report downloaded with the current section structure.");
});

$("#clearButton").addEventListener("click", () => {
  form.reset();
  [...form.elements].forEach(element => { if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") element.value = ""; });
  reportType.value = "Consultation Report";
  state.generated = false; state.reportType = "Consultation Report"; state.numberingStyle = "automatic"; state.sections = []; state.loadedTemplate = null;
  numberingStyle.value = "automatic";
  selectTab("notes"); updateWordCount();
  $("#emptyReport").hidden = false; reportDocument.hidden = true; reportSections.innerHTML = "";
  copyButton.disabled = true; downloadButton.disabled = true; saveTemplateButton.disabled = true;
  $("#draftStatus").classList.remove("ready"); $("#draftStatus").innerHTML = "<i></i> Waiting for consultation input";
  $$(".quality-list li").forEach(item => item.classList.remove("checked")); $("#qualityScore").textContent = "0/4";
  setProgress("input"); $("#title").focus(); showToast("Form cleared. Saved templates remain available.");
});

$("#notesTab").addEventListener("click", () => selectTab("notes"));
$("#audioTab").addEventListener("click", () => selectTab("audio"));
notes.addEventListener("input", updateWordCount);

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

$("#templateName").addEventListener("input", event => { saveTemplateButton.disabled = !state.generated || !clean(event.target.value); });
saveTemplateButton.addEventListener("click", saveTemplate);
savedTemplates.addEventListener("change", () => { const enabled = Boolean(savedTemplates.value); $("#loadTemplate").disabled = !enabled; $("#deleteTemplate").disabled = !enabled; });
$("#loadTemplate").addEventListener("click", loadTemplate);
$("#deleteTemplate").addEventListener("click", removeTemplate);

updateWordCount();
refreshTemplateLibrary();
applyBranding();
