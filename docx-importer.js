(function registerDocxTemplateImporter(global) {
  "use strict";

  const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const MAX_FILE_SIZE = 15 * 1024 * 1024;

  class DocxImportError extends Error {
    constructor(message, code = "DOCX_IMPORT_ERROR") {
      super(message);
      this.name = "DocxImportError";
      this.code = code;
    }
  }

  function requireRange(view, offset, length, label) {
    if (offset < 0 || length < 0 || offset + length > view.byteLength) {
      throw new DocxImportError(`The DOCX ${label} is incomplete or corrupt.`, "CORRUPT_DOCX");
    }
  }

  function findEndOfCentralDirectory(view) {
    const minimum = Math.max(0, view.byteLength - 65557);
    for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
      if (view.getUint32(offset, true) === 0x06054b50) return offset;
    }
    throw new DocxImportError("This file is not a valid DOCX package.", "INVALID_DOCX");
  }

  function readZipDirectory(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const eocd = findEndOfCentralDirectory(view);
    requireRange(view, eocd, 22, "directory");
    const entryCount = view.getUint16(eocd + 10, true);
    let offset = view.getUint32(eocd + 16, true);
    const entries = new Map();
    const decoder = new TextDecoder("utf-8");

    for (let index = 0; index < entryCount; index += 1) {
      requireRange(view, offset, 46, "directory entry");
      if (view.getUint32(offset, true) !== 0x02014b50) {
        throw new DocxImportError("The DOCX directory is corrupt.", "CORRUPT_DOCX");
      }
      const flags = view.getUint16(offset + 8, true);
      const method = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const uncompressedSize = view.getUint32(offset + 24, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);
      requireRange(view, offset + 46, nameLength + extraLength + commentLength, "directory name");
      const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
      entries.set(name, { flags, method, compressedSize, uncompressedSize, localOffset });
      offset += 46 + nameLength + extraLength + commentLength;
    }
    return { entries, view };
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream !== "function") {
      throw new DocxImportError("DOCX import is not supported by this browser version.", "UNSUPPORTED_BROWSER");
    }
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
      throw new DocxImportError("The compressed DOCX content could not be read.", "CORRUPT_DOCX");
    }
  }

  async function extractZipEntry(zip, bytes, name) {
    const entry = zip.entries.get(name);
    if (!entry) throw new DocxImportError(`The DOCX is missing ${name}.`, "INVALID_DOCX");
    if (entry.flags & 1) throw new DocxImportError("Password-protected DOCX files cannot be imported.", "ENCRYPTED_DOCX");
    if (entry.compressedSize === 0xffffffff || entry.uncompressedSize === 0xffffffff) {
      throw new DocxImportError("ZIP64 DOCX files are not supported in this local importer.", "UNSUPPORTED_DOCX");
    }
    const { view } = zip;
    requireRange(view, entry.localOffset, 30, "file entry");
    if (view.getUint32(entry.localOffset, true) !== 0x04034b50) {
      throw new DocxImportError("The DOCX file entry is corrupt.", "CORRUPT_DOCX");
    }
    const nameLength = view.getUint16(entry.localOffset + 26, true);
    const extraLength = view.getUint16(entry.localOffset + 28, true);
    const start = entry.localOffset + 30 + nameLength + extraLength;
    requireRange(view, start, entry.compressedSize, "compressed content");
    const compressed = bytes.subarray(start, start + entry.compressedSize);
    if (entry.method === 0) return compressed;
    if (entry.method === 8) return inflateRaw(compressed);
    throw new DocxImportError("This DOCX uses an unsupported compression method.", "UNSUPPORTED_DOCX");
  }

  function parseXml(text, label) {
    const document = new DOMParser().parseFromString(text, "application/xml");
    if (document.querySelector("parsererror")) {
      throw new DocxImportError(`The DOCX ${label} XML is corrupt.`, "CORRUPT_DOCX");
    }
    return document;
  }

  function wordAttribute(element, name) {
    return element?.getAttributeNS(WORD_NS, name) || element?.getAttribute(`w:${name}`) || "";
  }

  function firstWordElement(parent, name) {
    return parent?.getElementsByTagNameNS(WORD_NS, name)?.[0] || null;
  }

  function readStyles(stylesDocument) {
    const styles = new Map();
    [...stylesDocument.getElementsByTagNameNS(WORD_NS, "style")].forEach(style => {
      if (wordAttribute(style, "type") && wordAttribute(style, "type") !== "paragraph") return;
      const id = wordAttribute(style, "styleId");
      if (!id) return;
      const name = wordAttribute(firstWordElement(style, "name"), "val");
      const basedOn = wordAttribute(firstWordElement(style, "basedOn"), "val");
      const outlineValue = wordAttribute(firstWordElement(style, "outlineLvl"), "val");
      const outlineLevel = outlineValue === "" ? null : Number(outlineValue) + 1;
      styles.set(id, { id, name, basedOn, outlineLevel: Number.isFinite(outlineLevel) ? outlineLevel : null });
    });
    return styles;
  }

  function headingLevelForStyle(styleId, styles, visited = new Set()) {
    if (!styleId || visited.has(styleId)) return null;
    visited.add(styleId);
    const style = styles.get(styleId);
    const identity = `${styleId} ${style?.name || ""}`;
    if (/^toc\s*\d*/i.test(style?.name || "") || /^toc\d*/i.test(styleId)) return null;
    const headingMatch = identity.match(/heading\s*([1-9])/i);
    if (headingMatch) return Number(headingMatch[1]);
    if (style?.outlineLevel) return style.outlineLevel;
    return style?.basedOn ? headingLevelForStyle(style.basedOn, styles, visited) : null;
  }

  function detectSections(documentXml, stylesXml) {
    const document = parseXml(documentXml, "document");
    const stylesDocument = parseXml(stylesXml, "styles");
    const styles = readStyles(stylesDocument);
    const body = firstWordElement(document, "body");
    if (!body) throw new DocxImportError("The DOCX document body is missing.", "INVALID_DOCX");
    const sections = [];

    [...body.getElementsByTagNameNS(WORD_NS, "p")].forEach(paragraph => {
      const paragraphProperties = firstWordElement(paragraph, "pPr");
      const styleId = wordAttribute(firstWordElement(paragraphProperties, "pStyle"), "val");
      const style = styles.get(styleId);
      if (/^(title|subtitle|header|footer)$/i.test(style?.name || "") || /^toc\s*\d*/i.test(style?.name || "")) return;
      const directOutline = wordAttribute(firstWordElement(paragraphProperties, "outlineLvl"), "val");
      const level = directOutline === "" ? headingLevelForStyle(styleId, styles) : Number(directOutline) + 1;
      if (!Number.isFinite(level) || level < 1 || level > 9) return;
      const title = [...paragraph.getElementsByTagNameNS(WORD_NS, "t")].map(node => node.textContent || "").join("").replace(/\s+/g, " ").trim();
      if (!title) return;
      sections.push({
        id: `imported-section-${sections.length + 1}`,
        title,
        level,
        order: sections.length,
        sourceStyleId: styleId || "",
        sourceStyleName: style?.name || ""
      });
    });
    return sections;
  }

  async function analyze(file) {
    if (!file) throw new DocxImportError("Choose a DOCX file to import.", "NO_FILE");
    if (!/\.docx$/i.test(file.name || "")) throw new DocxImportError("Choose a .docx template file.", "INVALID_FILE_TYPE");
    if (!file.size) throw new DocxImportError("The selected DOCX is empty.", "EMPTY_DOCX");
    if (file.size > MAX_FILE_SIZE) throw new DocxImportError("Choose a DOCX smaller than 15 MB.", "FILE_TOO_LARGE");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const zip = readZipDirectory(bytes);
    const decoder = new TextDecoder("utf-8");
    const [documentBytes, stylesBytes] = await Promise.all([
      extractZipEntry(zip, bytes, "word/document.xml"),
      zip.entries.has("word/styles.xml")
        ? extractZipEntry(zip, bytes, "word/styles.xml")
        : Promise.resolve(new TextEncoder().encode(`<w:styles xmlns:w="${WORD_NS}"/>`))
    ]);
    const sections = detectSections(decoder.decode(documentBytes), decoder.decode(stylesBytes));
    return {
      schemaVersion: 1,
      importer: "docx",
      source: {
        format: "docx",
        fileName: file.name,
        fileSize: file.size,
        importedAt: new Date().toISOString()
      },
      suggestedName: file.name.replace(/\.docx$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim(),
      sections,
      warnings: sections.length ? [] : ["No Word headings were detected. Add sections manually before saving."]
    };
  }

  global.TemplateImporters = global.TemplateImporters || {};
  global.TemplateImporters.docx = { analyze, detectSections, maxFileSize: MAX_FILE_SIZE, DocxImportError };
})(window);
