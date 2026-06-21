(function registerMediaLibraryStore(global) {
  "use strict";

  const databaseName = "consultation-report-assistant-media";
  const databaseVersion = 1;
  const storeName = "mediaItems";

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("The local media library request failed."));
    });
  }

  function transactionComplete(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("The local media library transaction failed."));
      transaction.onabort = () => reject(transaction.error || new Error("The local media library transaction was cancelled."));
    });
  }

  function createId() {
    return global.crypto?.randomUUID?.() || `media-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function open() {
    if (!global.indexedDB) return Promise.reject(new Error("IndexedDB is not available in this browser."));
    return new Promise((resolve, reject) => {
      const request = global.indexedDB.open(databaseName, databaseVersion);
      request.onupgradeneeded = () => {
        const database = request.result;
        const store = database.objectStoreNames.contains(storeName)
          ? request.transaction.objectStore(storeName)
          : database.createObjectStore(storeName, { keyPath: "id" });
        if (!store.indexNames.contains("type")) store.createIndex("type", "type", { unique: false });
        if (!store.indexNames.contains("createdAt")) store.createIndex("createdAt", "createdAt", { unique: false });
        if (!store.indexNames.contains("name")) store.createIndex("name", "name", { unique: false });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("The local media library could not be opened."));
      request.onblocked = () => reject(new Error("Close other open copies of this application, then try again."));
    });
  }

  async function withStore(mode, callback) {
    const database = await open();
    try {
      const transaction = database.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const result = await callback(store, transaction);
      if (mode === "readwrite") await transactionComplete(transaction);
      return result;
    } finally {
      database.close();
    }
  }

  async function list(type = "") {
    return withStore("readonly", async store => {
      const items = type && store.indexNames.contains("type")
        ? await requestResult(store.index("type").getAll(type))
        : await requestResult(store.getAll());
      return items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    });
  }

  async function get(id) {
    return withStore("readonly", store => requestResult(store.get(id)));
  }

  async function save({ type, name, blob, mimeType = "", metadata = {}, source = "recording" }) {
    if (!(blob instanceof Blob)) throw new Error("A valid media file is required.");
    const now = new Date().toISOString();
    const item = {
      id: createId(),
      type,
      name,
      createdAt: now,
      updatedAt: now,
      size: blob.size,
      mimeType: mimeType || blob.type || "application/octet-stream",
      blob,
      metadata: { ...metadata, source }
    };
    await withStore("readwrite", store => requestResult(store.add(item)));
    return item;
  }

  async function update(id, changes) {
    return withStore("readwrite", async store => {
      const current = await requestResult(store.get(id));
      if (!current) throw new Error("This media item no longer exists.");
      const updated = { ...current, ...changes, id: current.id, updatedAt: new Date().toISOString() };
      await requestResult(store.put(updated));
      return updated;
    });
  }

  async function duplicate(id, name = "") {
    const current = await get(id);
    if (!current) throw new Error("This media item no longer exists.");
    return save({
      type: current.type,
      name: name || `${current.name} Copy`,
      blob: current.blob,
      mimeType: current.mimeType,
      metadata: { ...(current.metadata || {}), duplicatedFrom: current.id },
      source: current.metadata?.source || "recording"
    });
  }

  async function remove(id) {
    return withStore("readwrite", store => requestResult(store.delete(id)));
  }

  global.MediaLibraryStore = { databaseName, databaseVersion, storeName, open, list, get, save, update, duplicate, remove };
})(window);
