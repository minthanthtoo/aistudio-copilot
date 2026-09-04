# AI Studio Copilot privacy policy

**Effective date:** 2026-09-04

AI Studio Copilot is a browser extension for organizing and running prompt
queues in Google AI Studio. It does not operate a remote service.

## Data handled

The extension reads the Google AI Studio page content needed to identify the
current prompt editor and queue state. Prompt text, app descriptions, queue
items, templates, and runner state are stored only in the browser's
`chrome.storage.local` for the user's profile. This data is not uploaded,
sold, shared, or used for advertising, profiling, or credit decisions.

The extension does not collect account passwords, authentication tokens,
payment information, precise location, browsing history, or analytics. It
does not use remote code or send prompts to an external server. Diagnostic
exports are created only when the user requests them and are locally
redacted to omit prompt text, labels, chain names, and internal identifiers.

## Permissions

`storage` keeps the user's local queues and settings. `scripting` and the
Google AI Studio host permission let the extension observe and interact with
the AI Studio prompt editor, solely to provide its queue and runner features.

## Retention and deletion

Data remains until the user deletes queues, templates, or extension storage,
or uninstalls the extension. No copy is retained by the developer.

## Contact

For questions or privacy requests, open an issue at
<https://github.com/minthanthtoo/aistudio-copilot/issues>.
