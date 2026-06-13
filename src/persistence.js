export function createIndexedDbPersistenceAdapter({
  dbName = 'e-ai-notebook',
  storeName = 'documents',
  notebookKey = 'interview-prep-notebook',
  globalScope = globalThis,
} = {}) {
  const databaseApi = globalScope.indexedDB;

  return {
    async loadNotebook() {
      const db = await openDatabase(databaseApi, dbName, storeName);
      return requestToPromise(db.transaction(storeName, 'readonly').objectStore(storeName).get(notebookKey));
    },

    async saveNotebook(notebook) {
      const db = await openDatabase(databaseApi, dbName, storeName);
      await requestToPromise(db.transaction(storeName, 'readwrite').objectStore(storeName).put(notebook, notebookKey));
      return notebook;
    },
  };
}

export function createMemoryPersistenceAdapter(initialNotebook = null) {
  let savedNotebook = clone(initialNotebook);

  return {
    async loadNotebook() {
      return clone(savedNotebook);
    },

    async saveNotebook(notebook) {
      savedNotebook = clone(notebook);
      return clone(savedNotebook);
    },
  };
}

function openDatabase(databaseApi, dbName, storeName) {
  if (!databaseApi) {
    return Promise.reject(new Error('IndexedDB is not available in this browser.'));
  }

  const request = databaseApi.open(dbName, 1);

  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(storeName)) {
      db.createObjectStore(storeName);
    }
  };

  return requestToPromise(request);
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}
