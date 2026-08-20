(function initAISQUIUtils(global) {
  "use strict";
  const Core = global.AISQCore;
  const ctx = global.AISQContext;

  function el(tag, options = {}, children = []) {
    const node = document.createElement(tag);
    if (options.className) node.className = options.className;
    if (options.text !== undefined) node.textContent = String(options.text);
    if (options.html !== undefined) node.innerHTML = String(options.html);
    if (options.id) node.id = options.id;
    if (options.title) node.title = options.title;
    if (options.type) node.type = options.type;
    if (options.placeholder) node.placeholder = options.placeholder;
    if (options.checked !== undefined) node.checked = !!options.checked;
    if (options.selected !== undefined) node.selected = !!options.selected;
    if (options.open !== undefined) node.open = !!options.open;
    if (options.disabled !== undefined) node.disabled = !!options.disabled;
    if (options.role) node.setAttribute("role", options.role);
    if (options.ariaLabel) node.setAttribute("aria-label", options.ariaLabel);
    if (options.ariaSelected !== undefined) node.setAttribute("aria-selected", String(!!options.ariaSelected));
    if (options.style) node.setAttribute("style", options.style);
    if (options.attrs) for (const [name, value] of Object.entries(options.attrs)) if (value !== undefined && value !== null) node.setAttribute(name, String(value));
    if (options.on) for (const [event, handler] of Object.entries(options.on)) node.addEventListener(event, handler);
    for (const child of Array.isArray(children) ? children : [children]) if (child) node.append(child);
    if (options.value !== undefined) node.value = String(options.value);
    return node;
  }

  function button(label, handler, kind = "", accessibleLabel = label) {
    return el("button", { className: `aisq-button ${kind}`.trim(), type: "button", text: label, title: accessibleLabel, ariaLabel: accessibleLabel, on: { click: handler } });
  }

  function field(label, control, help = "") {
    const wrap = el("label", { className: "aisq-field", title: label }, [el("span", { className: "aisq-label", text: label }), control]);
    if (help) wrap.append(el("span", { className: "aisq-help", text: help }));
    return wrap;
  }

  function numberSetting(key, label, divisor = 1, min = 0) {
    const input = el("input", { className: "aisq-input", type: "number", value: Number(ctx.state.settings[key]) / divisor });
    input.min = String(min);
    input.addEventListener("change", () => ctx.mutate(() => { ctx.state.settings[key] = Math.max(min, Number(input.value) || 0) * divisor; }));
    return field(label, input);
  }

  function checkboxSetting(key, label, help = "") {
    const input = el("input", { type: "checkbox", checked: ctx.state.settings[key], on: { change: () => ctx.mutate(() => { ctx.state.settings[key] = input.checked; }) } });
    const line = el("label", { className: "aisq-check" }, [input, el("span", { text: label })]);
    if (help) line.append(el("small", { text: help }));
    return line;
  }


  global.AISQUIUtils = { el, button, field, numberSetting, checkboxSetting };
  Object.assign(ctx, { el, button, field });
})(typeof globalThis !== "undefined" ? globalThis : this);
