// Slot-scoped canonical geography. Large typed arrays must never go into
// localStorage or the account hub. Quota errors are surfaced, not seed fallback
// masquerading as a successful save. Portable exports work without IndexedDB.
let connection;
async function database() {
  if (!globalThis.indexedDB) throw new Error('Хранилище планет недоступно; скачайте файл планеты.');
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open('mir:unified-planets', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('slots');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { connection = null; reject(request.error); };
    request.onblocked = () => { connection = null; reject(new Error('Хранилище планет заблокировано другой вкладкой.')); };
  });
  return connection;
}
async function operation(mode, action) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('slots', mode), request = action(tx.objectStore('slots'));
    let result;
    request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Не удалось сохранить планету. Скачайте файл планеты.'));
  });
}
export const loadPlanetSlot = key => operation('readonly', store => store.get(key));
export const savePlanetSlot = (key, value) => operation('readwrite', store => store.put(value, key));
export const deletePlanetSlot = key => operation('readwrite', store => store.delete(key));
