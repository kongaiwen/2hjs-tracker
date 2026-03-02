// Using native Web Crypto API - no external dependencies

export interface KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export interface ExportedKeyPair {
  publicKey: string; // PEM format
  privateKey: string; // PEM format
}

export interface EncryptedData {
  version: 1;
  algorithm: 'RSA-OAEP';
  ciphertext: string;
}

export interface HybridEncryptedData {
  v: 2;
  wrappedKey: string; // base64 RSA-OAEP wrapped AES-256 key
  iv: string;         // base64 12-byte IV
  ct: string;         // base64 AES-GCM ciphertext
}

export interface WrappedKeyData {
  v: 1;
  salt: string;   // base64, 16 bytes
  iv: string;     // base64, 12 bytes
  ct: string;     // base64, AES-GCM ciphertext of private key PEM
}

export class CryptoService {
  // Generate RSA-OAEP key pair for asymmetric encryption
  async generateKeyPair(): Promise<KeyPair> {
    return await window.crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt']
    );
  }

  // Export key to PEM format
  async exportKey(key: CryptoKey): Promise<string> {
    const exported = await window.crypto.subtle.exportKey('spki', key);
    const b64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
    return `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g)?.join('\n')}\n-----END PUBLIC KEY-----`;
  }

  async exportPrivateKey(key: CryptoKey): Promise<string> {
    const exported = await window.crypto.subtle.exportKey('pkcs8', key);
    const b64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
    return `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----`;
  }

  // Import key from PEM
  async importPublicKey(pem: string): Promise<CryptoKey> {
    const b64 = pem.replace(/-----BEGIN PUBLIC KEY-----/, '')
                   .replace(/-----END PUBLIC KEY-----/, '')
                   .replace(/\s/g, '');
    const binary = Uint8Array.from(atob(b64), c => c.charCodeAt(0));

    return await window.crypto.subtle.importKey(
      'spki',
      binary,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true,
      ['encrypt']
    );
  }

  async importPrivateKey(pem: string): Promise<CryptoKey> {
    const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, '')
                   .replace(/-----END PRIVATE KEY-----/, '')
                   .replace(/\s/g, '');
    const binary = Uint8Array.from(atob(b64), c => c.charCodeAt(0));

    return await window.crypto.subtle.importKey(
      'pkcs8',
      binary,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true,
      ['decrypt']
    );
  }

  // Encrypt data with public key
  async encrypt(data: any, publicKey: CryptoKey): Promise<EncryptedData> {
    const encoder = new TextEncoder();
    const encoded = encoder.encode(JSON.stringify(data));

    const encrypted = await window.crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      encoded
    );

    const ciphertext = btoa(String.fromCharCode(...new Uint8Array(encrypted)));

    return {
      version: 1,
      algorithm: 'RSA-OAEP',
      ciphertext
    };
  }

  // Decrypt data with private key
  async decrypt(encryptedData: EncryptedData, privateKey: CryptoKey): Promise<any> {
    const binary = Uint8Array.from(atob(encryptedData.ciphertext), c => c.charCodeAt(0));

    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      privateKey,
      binary
    );

    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decrypted));
  }

  // Generate key fingerprint for verification
  async generateFingerprint(publicKey: CryptoKey): Promise<string> {
    const exported = await window.crypto.subtle.exportKey('spki', publicKey);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', exported);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
  }

  // Hybrid encrypt: AES-256-GCM for data, RSA-OAEP to wrap the AES key
  async hybridEncrypt(data: any, publicKey: CryptoKey): Promise<HybridEncryptedData> {
    const encoder = new TextEncoder();
    const plaintext = encoder.encode(JSON.stringify(data));

    // Generate random AES-256 key and 12-byte IV
    const aesKey = await window.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt']
    );
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    // Encrypt data with AES-GCM
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      plaintext
    );

    // Export AES key and wrap it with RSA-OAEP
    const rawAesKey = await window.crypto.subtle.exportKey('raw', aesKey);
    const wrappedKey = await window.crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      rawAesKey
    );

    return {
      v: 2,
      wrappedKey: this.arrayBufferToBase64(wrappedKey),
      iv: this.arrayBufferToBase64(iv),
      ct: this.arrayBufferToBase64(ciphertext),
    };
  }

  // Hybrid decrypt: unwrap AES key with RSA, decrypt ciphertext with AES-GCM
  async hybridDecrypt(payload: HybridEncryptedData, privateKey: CryptoKey): Promise<any> {
    // Unwrap AES key with RSA-OAEP
    const wrappedKeyBuf = this.base64ToArrayBuffer(payload.wrappedKey);
    const rawAesKey = await window.crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      privateKey,
      wrappedKeyBuf
    );

    // Import AES key
    const aesKey = await window.crypto.subtle.importKey(
      'raw',
      rawAesKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    // Decrypt ciphertext with AES-GCM
    const iv = this.base64ToArrayBuffer(payload.iv);
    const ct = this.base64ToArrayBuffer(payload.ct);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      ct
    );

    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decrypted));
  }

  // Derive an AES-256 wrapping key from a passphrase using PBKDF2
  async deriveWrappingKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      encoder.encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return await window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt as BufferSource,
        iterations: 600_000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // Wrap a private key PEM with a user-chosen passphrase
  async wrapPrivateKey(privateKeyPEM: string, passphrase: string): Promise<WrappedKeyData> {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const wrappingKey = await this.deriveWrappingKey(passphrase, salt);

    const encoder = new TextEncoder();
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      wrappingKey,
      encoder.encode(privateKeyPEM)
    );

    return {
      v: 1,
      salt: this.arrayBufferToBase64(salt),
      iv: this.arrayBufferToBase64(iv),
      ct: this.arrayBufferToBase64(ciphertext),
    };
  }

  // Unwrap a private key PEM from the passphrase-wrapped payload
  async unwrapPrivateKey(wrapped: WrappedKeyData, passphrase: string): Promise<string> {
    const salt = new Uint8Array(this.base64ToArrayBuffer(wrapped.salt));
    const iv = new Uint8Array(this.base64ToArrayBuffer(wrapped.iv));
    const ct = this.base64ToArrayBuffer(wrapped.ct);

    const wrappingKey = await this.deriveWrappingKey(passphrase, salt);

    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      wrappingKey,
      ct
    );

    return new TextDecoder().decode(decrypted);
  }

  private arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    return btoa(String.fromCharCode(...bytes));
  }

  private base64ToArrayBuffer(b64: string): ArrayBuffer {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return bytes.buffer as ArrayBuffer;
  }

  // Generate fingerprint from PEM public key (async wrapper for generateFingerprint)
  async fingerprintFromPEM(pem: string): Promise<string> {
    const cryptoKey = await this.importPublicKey(pem);
    return await this.generateFingerprint(cryptoKey);
  }

  // Synchronous version for display purposes only (use async version when possible)
  fingerprintFromPEMSync(pem: string): string {
    // Simple hash of the PEM content for display - NOT cryptographically secure
    // Only use this when you can't use the async SHA-256 version
    let hash = 0;
    for (let i = 0; i < pem.length; i++) {
      const char = pem.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).padStart(16, '0').substring(0, 16);
  }
}
