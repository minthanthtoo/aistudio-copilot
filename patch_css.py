import re

with open("src/content.js", "r") as f:
    content = f.read()

css_insertion = """      .aisq-quickstart-card { display: flex; flex-direction: column; align-items: flex-start; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; background: #1d1c22; cursor: pointer; text-align: left; transition: all 0.2s ease; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
      .aisq-quickstart-card:hover { transform: translateY(-2px); border-color: rgba(115,87,255,0.4); background: #26252e; box-shadow: 0 6px 16px rgba(115,87,255,0.15); }
      .aisq-quickstart-card.hero { padding: 14px; }
      .aisq-quickstart-card.mini { padding: 10px; min-width: 140px; border-radius: 8px; }
      .aisq-quickstart-icon { font-size: 24px; margin-bottom: 8px; }
      .aisq-quickstart-card.mini .aisq-quickstart-icon { font-size: 20px; margin-bottom: 6px; }
      .aisq-quickstart-title { font-weight: 600; font-size: 14px; color: #f5f4fa; margin-bottom: 4px; }
      .aisq-quickstart-card.mini .aisq-quickstart-title { font-size: 13px; font-weight: 500; margin-bottom: 2px; }
      .aisq-quickstart-desc { font-size: 11px; color: #a9a6b4; line-height: 1.35; }
"""

# Insert right after .aisq-button.danger { ... }
content = content.replace(".aisq-button.danger { color:#ffaba9; }\n", ".aisq-button.danger { color:#ffaba9; }\n" + css_insertion)

with open("src/content.js", "w") as f:
    f.write(content)
