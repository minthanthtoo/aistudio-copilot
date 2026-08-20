(function initAdapterInterface(global) {
  "use strict";

  class StorageAdapter {
    constructor(chromeStorage) {
      this.storage = chromeStorage;
    }

    async get(key) {
      if (!this.storage) return null;
      const data = await this.storage.local.get(key);
      return data[key] || null;
    }

    async set(key, value) {
      if (!this.storage) return;
      await this.storage.local.set({ [key]: value });
    }

    async getSession(key) {
      if (!this.storage?.session) return null;
      const data = await this.storage.session.get(key);
      return data[key] || null;
    }

    async setSession(key, value) {
      if (!this.storage?.session) return;
      await this.storage.session.set({ [key]: value });
    }

    onChanged(callback) {
      if (!this.storage) return () => {};
      const listener = (changes, areaName) => callback(changes, areaName);
      this.storage.onChanged.addListener(listener);
      return () => this.storage.onChanged.removeListener(listener);
    }
  }

  const api = {
    StorageAdapter
  };

  global.AISQAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : this);
