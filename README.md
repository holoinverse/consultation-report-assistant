# Consultation Report Assistant

A premium, static SaaS-style prototype for transforming face-to-face consultation notes into structured community consultation reports.

The application is designed for councils, NGOs, multicultural organisations, policy teams and stakeholder engagement professionals. It uses local, deterministic JavaScript to organise source notes into an editable draft. It does **not** connect to or simulate an AI service.

## Run locally

Open `index.html` directly in a modern browser. No installation, server, account or build step is required.

## Features

- Consultation metadata and detailed notes input
- Seven editable report-type presets
- Notes and future Audio workflow tabs
- Local structured-draft generation
- Fully editable, removable and reorderable report sections
- Custom sections with automatic, manual or hidden numbering
- Local custom template saving and loading through browser storage
- Complete project saving and loading through downloadable JSON files
- Live report branding, colours, typography, logo, image and watermark controls
- Lightweight rich-text editing with headings, lists, quotes and inline formatting
- Local audio upload, playback and manual transcript workspace
- Real DOCX and PDF generation without external services
- Optional cover page, table of contents, running headers, footers, page numbers and confidentiality statements
- Report metadata and quality checklist
- Copy full report and download TXT
- Clear form, status messages and professional empty states
- Responsive and accessibility-conscious interface
- Product roadmap with future capabilities clearly labelled

## GitHub Pages

1. Add the four files in this folder to a GitHub repository.
2. Open the repository's **Settings → Pages**.
3. Publish from the branch containing `index.html` and select the repository root.

All asset paths are relative, so no changes are required for GitHub Pages.

## Privacy and scope

All report generation happens in the browser. Notes and uploaded images are not transmitted. Custom templates are stored only in the current browser and contain section structure—not consultation content. Users should review every generated section against the original consultation evidence before publication.

The roadmap describes planned product directions only. AI integration, automatic transcription, authentication, cloud persistence and collaboration are not implemented in this release. Current project files, templates, uploaded assets and exports remain local to the browser or device.

## Files

- `index.html` — semantic application structure
- `styles.css` — responsive premium interface
- `script.js` — local report generation and interactions
- `README.md` — usage and deployment guidance
