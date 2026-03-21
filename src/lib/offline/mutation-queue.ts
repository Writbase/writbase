export interface PendingMutation {
  id: string;
  type: 'create_task' | 'update_task';
  payload: Record<string, unknown>;
  createdAt: number;
  retries: number;
  status: 'pending' | 'syncing' | 'failed' | 'conflict';
}

const DB_NAME = 'writbase-offline';
const STORE_NAME = 'mutations';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(new Error(request.error?.message ?? 'Failed to open IndexedDB'));
    };
  });
}

export async function addMutation(
  mutation: Omit<PendingMutation, 'id' | 'createdAt' | 'retries' | 'status'>,
): Promise<string> {
  const db = await openDB();
  const id = crypto.randomUUID();
  const record: PendingMutation = {
    ...mutation,
    id,
    createdAt: Date.now(),
    retries: 0,
    status: 'pending',
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add(record);
    tx.oncomplete = () => {
      resolve(id);
    };
    tx.onerror = () => {
      reject(new Error(tx.error?.message ?? 'Failed to add mutation'));
    };
  });
}

export async function getPendingMutations(): Promise<PendingMutation[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('status');
    const request = index.getAll('pending');
    request.onsuccess = () => {
      const results = (request.result as PendingMutation[]).sort(
        (a, b) => a.createdAt - b.createdAt,
      );
      resolve(results);
    };
    request.onerror = () => {
      reject(new Error(request.error?.message ?? 'Failed to get mutations'));
    };
  });
}

export async function getAllMutations(): Promise<PendingMutation[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      const results = (request.result as PendingMutation[]).sort(
        (a, b) => a.createdAt - b.createdAt,
      );
      resolve(results);
    };
    request.onerror = () => {
      reject(new Error(request.error?.message ?? 'Failed to get mutations'));
    };
  });
}

export async function updateMutationStatus(
  id: string,
  status: PendingMutation['status'],
): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const record = getRequest.result as PendingMutation | undefined;
      if (record) {
        record.status = status;
        store.put(record);
      }
    };

    tx.oncomplete = () => {
      resolve();
    };
    tx.onerror = () => {
      reject(new Error(tx.error?.message ?? 'Failed to update mutation'));
    };
  });
}

export async function removeMutation(id: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => {
      resolve();
    };
    tx.onerror = () => {
      reject(new Error(tx.error?.message ?? 'Failed to remove mutation'));
    };
  });
}

export async function getMutationCount(): Promise<number> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).count();
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(new Error(request.error?.message ?? 'Failed to count mutations'));
    };
  });
}
