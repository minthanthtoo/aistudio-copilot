with open("src/ui-tabs.js", "r") as f:
    content = f.read()

replacement = """  function chainCard(chain, index) {
    const counts = Core.chainCounts(chain);
    let status = counts.pending ? "running" : counts.queued === 0 ? "done" : "queued";
    const selected = ctx.state.selectedChainId === chain.id;
    const isActive = ctx.state.runner.activeChainId === chain.id;
    const isPaused = isActive && !ctx.state.runner.enabled;
    let highlightClass = "";
    if (isActive) highlightClass = isPaused ? " aisq-highlight-paused" : " aisq-highlight-running";
    
    const justImported = ctx.state.ui && ctx.state.ui.lastImportId === chain.id;
    if (justImported) {
       highlightClass += " just-imported";
       setTimeout(() => { 
         if (ctx.state.ui.lastImportId === chain.id) { 
           ctx.state.ui.lastImportId = null; 
           ctx.requestRender(); 
         } 
       }, 2000);
    }
    
    const locked = isActive && ctx.state.runner.enabled;
    const card = el("div", { className: `aisq-chain-card ${locked ? "locked" : ""} ${selected ? "selected" : ""}${highlightClass}` });"""

content = content.replace("""  function chainCard(chain, index) {
    const counts = Core.chainCounts(chain);
    let status = counts.pending ? "running" : counts.queued === 0 ? "done" : "queued";
    const selected = ctx.state.selectedChainId === chain.id;
    const isActive = ctx.state.runner.activeChainId === chain.id;
    const isPaused = isActive && !ctx.state.runner.enabled;
    let highlightClass = "";
    if (isActive) highlightClass = isPaused ? " aisq-highlight-paused" : " aisq-highlight-running";
    const locked = isActive && ctx.state.runner.enabled;
    const card = el("div", { className: `aisq-chain-card ${locked ? "locked" : ""} ${selected ? "selected" : ""}${highlightClass}` });""", replacement)

with open("src/ui-tabs.js", "w") as f:
    f.write(content)
