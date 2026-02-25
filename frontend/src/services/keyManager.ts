import { CryptoService, ExportedKeyPair } from './cryptoService';

const KEY_STORAGE_KEY = '2hjs_encryption_keys';
const crypto = new CryptoService();

export class KeyManager {
  // Store keys in IndexedDB (more secure than localStorage)
  async storeKeys(keys: ExportedKeyPair): Promise<void> {
    await this.idbSet(KEY_STORAGE_KEY, keys);
  }

  async getKeys(): Promise<ExportedKeyPair | null> {
    return await this.idbGet(KEY_STORAGE_KEY);
  }

  async hasKeys(): Promise<boolean> {
    return await this.idbGet(KEY_STORAGE_KEY) !== null;
  }

  async clearKeys(): Promise<void> {
    await this.idbDelete(KEY_STORAGE_KEY);
  }

  // Get public key as CryptoKey for encryption
  async getPublicKey(): Promise<CryptoKey | null> {
    const keys = await this.getKeys();
    if (!keys) return null;
    return await crypto.importPublicKey(keys.publicKey);
  }

  // Get private key as CryptoKey for decryption
  async getPrivateKey(): Promise<CryptoKey | null> {
    const keys = await this.getKeys();
    if (!keys) return null;
    return await crypto.importPrivateKey(keys.privateKey);
  }

  // IndexedDB helpers
  private async idbSet(key: string, value: any): Promise<void> {
    const db = await this.openDB();
    const tx = db.transaction('keys', 'readwrite');
    await tx.objectStore('keys').put(value, key);
  }

  private async idbGet(key: string): Promise<any> {
    const db = await this.openDB();
    const tx = db.transaction('keys', 'readonly');
    return await tx.objectStore('keys').get(key);
  }

  private async idbDelete(key: string): Promise<void> {
    const db = await this.openDB();
    const tx = db.transaction('keys', 'readwrite');
    await tx.objectStore('keys').delete(key);
  }

  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('2hjs-keys', 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('keys')) {
          db.createObjectStore('keys');
        }
      };
    });
  }

  // Download keys as JSON file
  downloadKeys(keys: ExportedKeyPair): void {
    const blob = new Blob([JSON.stringify(keys, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `2hjs-keys-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
