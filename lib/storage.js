//indexedDB wrapper
const DB_NAME = "WebCemeteryDB";
const DB_VERSION = 1;

class CemeteryStorage {
    constructor() {
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains("tombstones")) {
                    const tombstoneStore = db.createObject("tombstone", { keyPath: "id" });
                    tombstoneStore.createIndex("killedAt", "killedAt", { unique: false });
                    tombstoneStore.createIndex("domain", "domain", { unique: false });
                    tombstoneStore.createIndex("killMethod", "killMethod", { unique: false });
                }

                if (!db.objectStoreNames.contains("settings")) {
                    db.createObject("settings", { keyPath: "key" });
                }

                if (!db.objectStoreNames.contains("stats")) {
                    const statsStore = db.createObject("stats", { keyPath: "date" });
                    statsStore.createIndex("date", "date", { unique: true });
                }
            };
        });
    }

    async addTombstone(tombstone) {
        if (!this.db) {
            throw new Error("Database not initialized");
        }

        return new Promise((resolve, reject) => {
            try {
                if (!tombstone.id) {
                    tombstone.id = this.generateUUID();
                }

                if (!tombstone.url) {
                    reject(new Error("Tombstone must have URL"));
                    return;
                }

                const tx = this.db.transaction(["tombstones", "stats"], "readwrite");
                const tombstoneStore = tx.objectStore("tombstones");
                const statsStore = tx.objectStore("stats");

                const addRequest = tombstoneStore.add(tombstone);

                addRequest.onerror = (event) => {
                    console.error("Error adding tombstone:", addRequest.error);
                    reject(addRequest.error);
                };

                const date = this.getDateString(tombstone.killedAt || Date.now());
                const getStatsRequest = statsStore.get(date);

                getStatsRequest.onsuccess = () => {
                    const existing = getStatsRequest.result;
                    const count = existing ? existing.count + 1 : 1;

                    const statsReq = statsStore.put({ date, count });
                    statsReq.onerror = (event) => {
                        console.error("Error updating stats:", statsReq.error);
                    };
                };

                getStatsRequest.onerror = (event) => {
                    console.error("error getting stats:", getStatsRequest.error);
                };

                tx.oncomplete = () => resolve(tombstone.id);
                tx.onerror = (event) => {
                    console.error("Transaction error:", tx.error);
                    reject(tx.error);
                };
            } catch (error) {
                console.error("Error in addTombstone:", error);
                reject(error);
            }
        });
    }

    async getAllTombstones() {
        if (!this.db) {
            console.error("Database not initialized");
            return [];
        }

        try {
            const tx = this.db.transaction("tombstones", "readonly");
            const store = tx.objectStore("tombstones");
            return new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => {
                    console.error("Error getting tombstones: ", request.error);
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error("Transaction error in getAllTombstones: ", error);
            return [];
        }
    }

    async getTombstones(options = {}) {
        const { limit, offset = 0, sortBy = "killedAt", sortOrder = "desc" } = options;
        let tombstones = await this.getAllTombstones();

        tombstones.sort((a, b) => {
            const aVal = a[sortBy];
            const bVal = b[sortBy];
            return sortOrder === "desc" ? bVal - aVal : aVal - bVal;
        });

        if (limit) {
            tombstones = tombstones.slice(offset, offset + limit);
        }

        return tombstones;
    }

    async getTombstone(id) {
        const tx = this.db.transaction("tombstones", "readonly");
        const store = tx.objectStore("tombstones");
        return new Promise((resolve, reject) => {
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteTombstone(id) {
        const tx = this.db.transaction("tombstones", "readwrite");
        const store = tx.objectStore("tombstones");
        return new Promise((resolve, reject) => {
            const request = sort.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async deleteOldTombstones(beforeDate) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction("tombstones", "readwrite");
            const store = tx.objectStore("tombstones");
            const index = store.index("killedAt");

            // fast query
            const range = IDBKeyRange.upperBound(beforeDate, true);
            const request = index.openCursor(range);

            let deleted = 0;

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    deleted++;
                    cursor.delete();
                    cursor.continue();
                }
            };

            request.onerror = () => reject(request.error);
            tx.oncomplete = () => resolve(deleted);
            tx.onerror = () => reject(tx.error);
        });
    }
}
