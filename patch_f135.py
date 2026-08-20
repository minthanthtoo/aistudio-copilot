import re

with open("src/ui-tabs.js", "r") as f:
    content = f.read()

# Add Audience, Industry, Security right after Tech Stack

audience_fields = """
      (visible.audience ? field("Target Audience", el("input", { className: "aisq-input", value: ctx.state.ui.specAnswers.audience || "", placeholder: "e.g. Developers, Small Business Owners", on: { input: e => { ctx.state.ui.specAnswers.audience = e.target.value; } } })) : null),
      (visible.industry ? field("Industry / Domain", el("input", { className: "aisq-input", value: ctx.state.ui.specAnswers.industry || "", placeholder: "e.g. Healthcare, Fintech, Education", on: { input: e => { ctx.state.ui.specAnswers.industry = e.target.value; } } })) : null),
      (visible.security ? field("Security Needs", el("input", { className: "aisq-input", value: ctx.state.ui.specAnswers.security || "", placeholder: "OAuth, E2E Encryption, RBAC", on: { input: e => { ctx.state.ui.specAnswers.security = e.target.value; } } })) : null),
"""

content = content.replace('techStackFields ? field("Tech Stack", techStackFields) : null,', 'techStackFields ? field("Tech Stack", techStackFields) : null,' + audience_fields)


# Add Copy to Clipboard in Review Stages & Text
copy_btn = """
        el("div", { style: "display: flex; justify-content: flex-end; margin-top: 8px;" }, [
          button("📋 Copy to Clipboard", () => navigator.clipboard.writeText((result.preface ? result.preface + "\\n\\n" : "") + result.raw), "ghost")
        ]),
"""
content = content.replace('el("div", { style: "margin-top: 12px;" }, stageCards),', 'el("div", { style: "margin-top: 12px;" }, stageCards),' + copy_btn)


# Add Save as Template button in footer
save_template = """
      (() => {
        let saveMode = false;
        const saveNameInput = el("input", { className: "aisq-input", placeholder: "Template name...", style: "display:none;width:140px;" });
        const saveBtn = button("💾 Save as Template", async () => {
          if (!saveMode) {
            saveMode = true;
            saveNameInput.style.display = "";
            saveNameInput.focus();
          } else {
            const name = saveNameInput.value.trim();
            if (name) {
              await saveUserTemplate(name, ctx.state.ui.specAnswers);
              saveNameInput.value = "";
              saveNameInput.style.display = "none";
              saveMode = false;
              saveBtn.textContent = "✓ Saved!";
              setTimeout(() => { saveBtn.textContent = "💾 Save as Template"; }, 2000);
            }
          }
        }, "ghost");
        return el("div", { style: "display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 16px;" }, [saveNameInput, saveBtn]);
      })(),
"""

content = content.replace('el("div", { className: "aisq-actions", style: "margin-top: 16px;" }, [', save_template + '\n      el("div", { className: "aisq-actions", style: "margin-top: 8px;" }, [')

with open("src/ui-tabs.js", "w") as f:
    f.write(content)

