require('./src/core.js');

const state = AISQCore.defaultState();
// Set up projects proxy properly
state.projects["app:home"] = { chains: [{ id: "c1" }], stackOrder: ["c1"], selectedChainId: "c1" };
AISQCore.getCurrentPageKey = () => "app:home";
const migrated = AISQCore.migrateState(state);

// Simulate backup creation
const backup = JSON.parse(JSON.stringify(migrated));

// Corrupt the backup intentionally
backup.projects["app:home"].chains = undefined;

// Simulate restore
Object.assign(migrated, backup);

console.log("After restore, migrated.chains is Array?", Array.isArray(migrated.chains));
console.log("After restore, migrated.chains:", migrated.chains);
