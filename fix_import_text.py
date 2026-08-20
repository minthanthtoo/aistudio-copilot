import re

with open("src/ui-tabs.js", "r") as f:
    content = f.read()

bad_import = r'''  function importText\(raw, strategy = ctx\.state\.ui\.splitStrategy, options = \{\}\) \{
    const parsed = Core\.parsePromptPack\(raw, strategy\);
    if \(!parsed\.prompts\.length\) \{
      alert\("No prompts found\."\);
      return \{ ok: false \};
    \}
    const chain = Core\.makeChain\(\{ name: options\.name \|\| "Imported Chain" \}\);
    if \(options\.preface\) chain\.preface = options\.preface;
    chain\.prompts = parsed\.prompts\.map\(p => Core\.makePrompt\(p\)\);'''

good_import = """  function importText(raw, strategy = ctx.state.ui.splitStrategy, options = {}) {
    const parsed = Core.parsePromptPack(raw, strategy);
    if (!parsed.prompts.length) {
      alert("No prompts found.");
      return { ok: false };
    }
    const number = (ctx.state.chains || []).length + 1;
    const chain = Core.makeChain(options.name || `Chain ${number}`, parsed.prompts, raw, { splitStrategy: parsed.strategy, pastedAt: Core.nowISO(), preface: options.preface || parsed.preface });"""

content = re.sub(bad_import, good_import, content)

with open("src/ui-tabs.js", "w") as f:
    f.write(content)
