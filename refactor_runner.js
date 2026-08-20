const fs = require('fs');
let code = fs.readFileSync('src/runner.js', 'utf8');

// Match `ctx.state.runner.phase = PHASES.XXXX;` or `ctx.state.runner.phase = expr ? ... : ...;`
// By ensuring it's followed by a space or specific characters, we avoid matching `===`.
code = code.replace(/ctx\.state\.runner\.phase\s*=\s*([^;]+);/g, (match, expr) => {
    // If expr starts with `=`, it was `==` or `===`, so return match as is
    if (expr.startsWith('=')) return match;
    
    // Otherwise, replace it
    return `Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: ${expr} });`;
});

fs.writeFileSync('src/runner.js', code);
