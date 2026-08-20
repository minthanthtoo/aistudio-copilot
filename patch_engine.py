import re

with open("src/spec-engine.js", "r") as f:
    content = f.read()

target = """    preface += `Technical Constraints:\\n`;
    preface += `- Architecture: ${ARCHETYPES[answers.archetype]?.label || answers.archetype}\\n`;
    preface += `- Frontend: ${answers.frontend}\\n`;
    if (answers.backend && answers.backend !== "None") preface += `- Backend: ${answers.backend}\\n`;
    if (answers.database && answers.database !== "None") preface += `- Database: ${answers.database}\\n`;
    preface += `- Hosting: ${answers.hosting}\\n`;"""

replacement = """    preface += `Technical Constraints:\\n`;
    preface += `- Architecture: ${ARCHETYPES[answers.archetype]?.label || answers.archetype}\\n`;
    if (answers.frontend && answers.frontend !== "None" && answers.frontend !== "__custom__") preface += `- Frontend: ${answers.frontend}\\n`;
    if (answers.backend && answers.backend !== "None" && answers.backend !== "__custom__") preface += `- Backend: ${answers.backend}\\n`;
    if (answers.database && answers.database !== "None" && answers.database !== "__custom__") preface += `- Database: ${answers.database}\\n`;
    if (answers.hosting && answers.hosting !== "None" && answers.hosting !== "__custom__") preface += `- Hosting: ${answers.hosting}\\n`;"""

content = content.replace(target, replacement)

with open("src/spec-engine.js", "w") as f:
    f.write(content)
