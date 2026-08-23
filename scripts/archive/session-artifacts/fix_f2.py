with open("src/ui-tabs.js", "r") as f:
    content = f.read()

bad_code = """
      details.append(
        field("Detection mode Override", strategy),
        el("div", { style: "margin-top: 12px;" }, [openWizardBtn]),
        
      const myTemplatesContainer = el("div", { style: "display: flex; flex-direction: column; gap: 8px; margin-top: 12px; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px;" });
"""

good_code = """
      const myTemplatesContainer = el("div", { style: "display: flex; flex-direction: column; gap: 8px; margin-top: 12px; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px;" });
"""

content = content.replace(bad_code.strip(), good_code.strip())

# And at the end, I need to find where `myTemplatesContainer,\n        renderCrossProjectImport()\n      );` is and properly wrap it in `details.append`
end_bad_code = """
        myTemplatesContainer.appendChild(importRow);
      };
      renderMyTemplates();

        myTemplatesContainer,
        renderCrossProjectImport()
      );
    }
    
    return details;
"""

end_good_code = """
        myTemplatesContainer.appendChild(importRow);
      };
      renderMyTemplates();

      details.append(
        field("Detection mode Override", strategy),
        el("div", { style: "margin-top: 12px;" }, [openWizardBtn]),
        myTemplatesContainer,
        renderCrossProjectImport()
      );
    }
    
    return details;
"""

content = content.replace(end_bad_code.strip(), end_good_code.strip())

with open("src/ui-tabs.js", "w") as f:
    f.write(content)
