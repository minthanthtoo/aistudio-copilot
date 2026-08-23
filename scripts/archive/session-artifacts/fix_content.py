with open("src/content.js", "r") as f:
    content = f.read()

import re

# Remove the incorrectly injected CSS block
bad_css = """      .aisq-toast-container { position:fixed; right:18px; bottom:80px; z-index:2147483648; display:flex; flex-direction:column; gap:8px; pointer-events:none; }
      @keyframes aisq-toast-in { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      @keyframes aisq-toast-out { from { opacity: 1; } to { opacity: 0; transform: translateY(-10px); } }
      .aisq-toast { pointer-events:auto; padding:10px 14px; border-radius:10px; background:#1d1c22; border:1px solid #ffffff20; color:#f5f4fa; font-size:12px; box-shadow:0 8px 24px rgba(0,0,0,0.4); animation:aisq-toast-in 0.3s ease-out; display:flex; align-items:center; gap:8px; max-width:320px; word-break:break-word; }
      .aisq-toast.success { border-color:rgba(85,230,155,0.4); }
      .aisq-toast.error { border-color:rgba(255,109,105,0.4); }
      .aisq-toast.undo { border-color:rgba(185,169,255,0.4); }
      .aisq-toast-undo-btn { margin-left:auto; background:rgba(115,87,255,0.15); border:1px solid rgba(115,87,255,0.3); color:#b9a9ff; padding:2px 8px; border-radius:6px; cursor:pointer; font-weight:600; font-size:11px; }
      .aisq-toast-undo-btn:hover { background:rgba(115,87,255,0.25); color:#fff; }
      @keyframes aisq-chain-glow { 0% { box-shadow:0 0 0 3px rgba(115,87,255,0.6); } 100% { box-shadow:0 0 0 0 transparent; } }
      .aisq-chain-card.just-imported { animation:aisq-chain-glow 1.5s ease-out; }
      .aisq-quickstart-card { transition:transform 0.15s, box-shadow 0.15s, border-color 0.15s; border:1px solid #ffffff16; border-radius:11px; background:#1d1c22; padding:12px; cursor:pointer; display:flex; flex-direction:column; align-items:flex-start; text-align:left; }
      .aisq-quickstart-card:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(115,87,255,0.15); border-color:#7357ff; }
      .aisq-detect-badge { position:absolute; right:8px; top:8px; font-size:10px; padding:2px 8px; border-radius:999px; background:rgba(115,87,255,0.15); color:#b9a9ff; font-weight:600; }
"""

# The bad CSS was placed right before `    shadow.append(style);\n  }`
# which was replacing `    shadow.append(style);\n  }`

content = content.replace(bad_css + "    shadow.append(style);\n  }", "    shadow.append(style);\n  }")

# Now, add it inside the template literal. 
# The template literal ends with:
# `.aisq-global-tooltip.visible { opacity:1; }
# .aisq-global-tooltip.bottom-placed { transform:translate(-50%, 0); margin-top:8px; }`;
# So we can replace that!

good_css_replacement = """
.aisq-global-tooltip.visible { opacity:1; }
.aisq-global-tooltip.bottom-placed { transform:translate(-50%, 0); margin-top:8px; }

""" + bad_css + """`;"""

content = content.replace(".aisq-global-tooltip.visible { opacity:1; }\n.aisq-global-tooltip.bottom-placed { transform:translate(-50%, 0); margin-top:8px; }`;", good_css_replacement)

with open("src/content.js", "w") as f:
    f.write(content)

