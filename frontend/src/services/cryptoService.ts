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

  // Generate fingerprint from PEM public key
  fingerprintFromPEM(pem: string): string {
    // Simple hash of the PEM content for display
    let hash = 0;
    for (let i = 0; i < pem.length; i++) {
      const char = pem.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).padStart(16, '0').substring(0, 16);
  }
}
