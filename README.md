# JS Overrides Extension

<div align="center">
  <img src="https://github.com/user-attachments/assets/8c4f96a9-b839-4a41-ad34-4767240c9882" width="600" alt="JS Overrides extension Screenshot" />
</div>
<br />

A browser extension that allows you to define and apply JavaScript overrides via cookies and injected script tags.

Built with **React**, **TypeScript**, **Vite** and **Chrome Extensions Manifest v3**.

---

## Features

- Create / save multiple override profiles
- Apply / disable overrides per tab
- Store overrides as cookies
- Automatically inject / remove overrides based on profile configuration

---

## Getting Started

### Prerequisites

Make sure you're using **Node.js v20.19.0**.

If you use [nvm](https://github.com/nvm-sh/nvm), you can set it up like this:

```bash
nvm install 20.19.0
nvm use 20.19.0
```

### 1. Install Dependencies

```bash
npm install
```

### 2. Build the Extension

```bash
npm run build
```

This outputs the production-ready extension into the `dist/` folder.

---

## Load the Extension in Chrome

1. Open **Chrome** and go to:

```
chrome://extensions
```

2. Enable **Developer mode** (top right)
3. Click **“Load unpacked”**
4. Select the `dist/` folder in your project
5. The extension should now appear in your Chrome toolbar

## Folder Structure

```bash
├── src/
├── public/
├── dist/
├── vite.config.ts
├── manifest.json
```
