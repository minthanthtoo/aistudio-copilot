# AI Studio Copilot

A prompt engineering assistant and queue automation copilot for [Google AI Studio Apps](https://aistudio.google.com/apps). 

AI Studio Copilot helps you manage, stack, and automate complex prompt chains. Whether you're pasting a massive 15-step app specification or queuing up multiple tweaks, Copilot runs them sequentially, handles retries gracefully, and survives page reloads—leaving you free to step away while your app builds itself.

---

## ✨ Features

- **Automated Prompt Chains**: Paste a large prompt pack, automatically split it into stages (using Markdown headers, numbers, or delimiters), and stack them in a queue.
- **State-Aware Reliability**: Copilot reads the DOM to know exactly when Gemini is generating, when it has finished, or if it hit an error. It automatically handles retries and pauses if things go wrong.
- **Compact Media Player Mode**: Collapse the UI into a sleek, floating control bar (`▶️ Start`, `⏸️ Pause`, `⏭️ Skip`) to manage your chains without cluttering your screen.
- **Multi-Tab Safe**: A lightweight service worker ensures only one tab runs at a time, preventing cross-tab conflicts and synchronizing state across windows.
- **ZIP Export**: Quickly download your generated app with the click of a button (`Alt+D`).
- **(Coming Soon) Spec Generation Wizard**: An intelligent, adaptive workflow to generate tailored, production-ready prompt chains for web apps, SaaS, and enterprise systems.

## 🚀 Installation

This extension is currently installed as an "unpacked" developer extension.

1. Clone or download this repository to your computer.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked** and select the `aistudio-copilot` folder.
5. Open [Google AI Studio Apps](https://aistudio.google.com/apps). The purple **AISQ** bubble will appear at the lower-right!

*Tip: You can use `Alt+Shift+A` to toggle the Copilot panel.*

## 🕹️ How to Use

1. **Build Tab**: Paste a prompt pack (like a multi-step app spec) and choose how it should be split. 
2. **Prompts Tab**: Review the generated chain. You can edit prompts, reorder them, or rename the chain.
3. **Run Tab / Top Bar**: Click **▶️ Start** to execute the full stack. Copilot will submit the first prompt, wait for Gemini to finish generating, and automatically submit the next one.
4. **Settings**: Customize execution speed, timeouts, and whether the Copilot should automatically "Allow access" or apply "Auto-fixes" when AI Studio asks.

## 🔒 Privacy & Permissions

AI Studio Copilot runs entirely in your browser. 
- **No data leaves your machine:** Prompts and queues are stored purely in `chrome.storage.local`.
- **No tracking:** There is no analytics, remote service, credential access, cookie access, or network exfiltration.
- **Diagnostics:** You can generate a redacted diagnostic snapshot for troubleshooting that strips all personal prompt text and labels.

## 💻 Development

The project is a zero-build Manifest V3 extension, written in pure JavaScript with zero dependencies for the core extension.

To run the test suite (requires Node.js):
```bash
npm install
npm run verify
```

The 40-test suite runs entirely in Node using `jsdom` and the native Node test runner, validating DOM state-machine transitions, multi-tab coordination, and queue logic.

To package a clean `.zip` for distribution:
```bash
npm run package:extension
```
