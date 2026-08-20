globalThis.AISQContext = {
  a: 1
};
try {
  Object.assign(globalThis.AISQContext, { tick: () => {} });
  console.log("Success:", typeof globalThis.AISQContext.tick);
} catch (e) {
  console.log("Error:", e.message);
}
