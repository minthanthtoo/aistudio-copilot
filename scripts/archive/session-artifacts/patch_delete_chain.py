with open("src/ui-tabs.js", "r") as f:
    content = f.read()

content = content.replace(
"""      if (confirm(`Delete ${chain.name}? This removes its prompts.`)) ctx.command("DELETE_CHAIN", { chainId: chain.id }, { history: { kind: "chain_deleted", message: `Deleted ${chain.name}` } });""",
"""      if (confirm(`Delete ${chain.name}? This removes its prompts.`)) {
        const res = ctx.command("DELETE_CHAIN", { chainId: chain.id }, { history: { kind: "chain_deleted", message: `Deleted ${chain.name}` } });
        if (res.ok) ctx.toast(`🗑 Deleted "${chain.name}"`, "info");
      }"""
)

content = content.replace(
"""    const duplicate = button("Duplicate chain", () => ctx.command("DUPLICATE_CHAIN", { chainId: chain.id }, { history: { kind: "chain_duplicated", message: `Duplicated ${chain.name}` } }), "ghost");""",
"""    const duplicate = button("Duplicate chain", () => {
      const res = ctx.command("DUPLICATE_CHAIN", { chainId: chain.id }, { history: { kind: "chain_duplicated", message: `Duplicated ${chain.name}` } });
      if (res.ok) ctx.toast(`✅ Duplicated "${chain.name}"`, "success");
    }, "ghost");"""
)

with open("src/ui-tabs.js", "w") as f:
    f.write(content)
