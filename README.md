# DuoCards Uebersicht Widget

A macOS Uebersicht widget that fetches vocabulary from DuoCards and displays it on the desktop.

## Features

- Fetches vocabulary cards from DuoCards using Playwright
- Saves fetched data locally as JSON
- Displays vocabulary inside a Uebersicht widget
- Supports reusable login sessions

## Requirements

- macOS
- Node.js 18 or later
- npm
- Uebersicht: https://www.ubersicht.de/

## Installation

Run:

npm install

## Project Structure

.
├── .gitignore
├── package.json
├── package-lock.json
├── scripts
│   ├── fetch-vocab.js
│   └── login-and-save-session.js
├── update_vocab.sh
├── widget
│   └── duocards-vocab.widget
│       └── index.jsx

## Usage

### 1. Log in to DuoCards

Run:

npm run login

This opens an automated browser flow and stores the authenticated session in:

state/duocards-session.json

### 2. Fetch vocabulary

Run:

npm run fetch

This saves the latest vocabulary data to:

output/vocab.json

### 3. Update the widget

Run:

./update_vocab.sh

This updates the local vocabulary data used by the Uebersicht widget.

## How It Works

### scripts/login-and-save-session.js

Creates or refreshes a saved DuoCards login session using Playwright.

### scripts/fetch-vocab.js

Uses the saved session to open DuoCards, collect vocabulary items, clean the extracted text, and write the final JSON output.

### widget/duocards-vocab.widget/index.jsx

Reads the generated vocabulary data and renders it inside a Uebersicht widget on macOS.

## Local Data

The project uses local runtime files that should not be committed, including:

- state/*.json
- output/*.json
- logs/*.log
- logs/*.txt

## Notes

- Before running the scripts, make sure local runtime directories such as state, output, and logs exist if required by your workflow.

## License

MIT



