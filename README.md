# Consultation Report Assistant

A premium, static SaaS-style prototype for transforming face-to-face consultation notes into structured community consultation reports.

The application is designed for councils, NGOs, multicultural organisations, policy teams and stakeholder engagement professionals. It uses local, deterministic JavaScript to organise source notes into an editable draft. It does **not** connect to or simulate an AI service.

## Run locally

Open `index.html` directly in a modern browser. No installation, server, account or build step is required.

## Features

- Consultation metadata and detailed notes input
- Notes and future Audio workflow tabs
- Local structured-draft generation
- Eight editable professional report sections
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

All report generation happens in the browser. Notes are not uploaded or stored by this prototype. Users should review every generated section against the original consultation evidence before publication.

The roadmap describes planned product directions only. AI integration, DOCX/PDF export, authentication, persistence, transcription and collaboration are not implemented in this release.

## Files

- `index.html` — semantic application structure
- `styles.css` — responsive premium interface
- `script.js` — local report generation and interactions
- `README.md` — usage and deployment guidance
