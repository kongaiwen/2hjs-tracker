import { CryptoService, HybridEncryptedData } from './cryptoService';
import { KeyManager } from './keyManager';

const cryptoService = new CryptoService();
const keyManager = new KeyManager();

export type EntityType =
  | 'employer'
  | 'contact'
  | 'outreach'
  | 'informational'
  | 'emailTemplate'
  | 'settings'
  | 'chatMessage';

// Fields that contain PII and should be encrypted per entity type
const SENSITIVE_FIELDS: Record<EntityType, string[]> = {
  employer: ['name', 'website', 'industry', 'location', 'notes'],
  contact: ['name', 'title', 'email', 'linkedInUrl', 'phone', 'notes'],
  outreach: ['subject', 'body', 'followUpBody', 'notes'],
  informational: [
    'researchNotes', 'bigFourAnswers', 'tiaraQuestions',
    'referralName', 'referralContact', 'nextSteps', 'notes',
  ],
  emailTemplate: ['name', 'subject', 'body', 'variables'],
  settings: [
    'googleAccessToken', 'googleRefreshToken', 'claudeApiKey',
    'defaultTimezone', 'workdayStart', 'workdayEnd', 'preferredCalendarId',
  ],
  chatMessage: ['content', 'metadata'],
};

// Cached CryptoKey objects to avoid repeated PEM imports
let cachedPublicKey: CryptoKey | null = null;
let cachedPrivateKey: CryptoKey | null = null;

async function getPublicKey(): Promise<CryptoKey | null> {
  if (cachedPublicKey) return cachedPublicKey;
  cachedPublicKey = await keyManager.getPublicKey();
  return cachedPublicKey;
}

async function getPrivateKey(): Promise<CryptoKey | null> {
  if (cachedPrivateKey) return cachedPrivateKey;
  cachedPrivateKey = await keyManager.getPrivateKey();
  return cachedPrivateKey;
}

// Call this when keys change (e.g. new key setup, key clear)
export function clearKeyCache(): void {
  cachedPublicKey = null;
  cachedPrivateKey = null;
}

export async function hasEncryptionKeys(): Promise<boolean> {
  return keyManager.hasKeys();
}

/**
 * Encrypt a record: splits into structural + sensitive fields,
 * encrypts sensitive blob, returns merged object with encryptedData.
 */
export async function encryptRecord(
  entityType: EntityType,
  record: Record<string, any>
): Promise<Record<string, any>> {
  const publicKey = await getPublicKey();
  if (!publicKey) return record; // No keys — send plaintext

  const sensitiveFields = SENSITIVE_FIELDS[entityType];
  if (!sensitiveFields) return record;

  // Split: structural stays, sensitive goes into blob
  const structural: Record<string, any> = {};
  const sensitive: Record<string, any> = {};

  for (const [key, value] of Object.entries(record)) {
    if (sensitiveFields.includes(key)) {
      sensitive[key] = value;
    } else {
      structural[key] = value;
    }
  }

  // If no sensitive data present, nothing to encrypt
  if (Object.keys(sensitive).length === 0) return record;

  const encryptedData = await cryptoService.hybridEncrypt(sensitive, publicKey);

  return {
    ...structural,
    encryptedData: JSON.stringify(encryptedData),
  };
}

/**
 * Decrypt a record: if encryptedData exists, decrypt and merge back.
 * If no encryptedData, return as-is (backward compat with plaintext records).
 */
export async function decryptRecord(
  _entityType: EntityType,
  record: Record<string, any>
): Promise<Record<string, any>> {
  if (!record || !record.encryptedData) return record;

  const privateKey = await getPrivateKey();
  if (!privateKey) return record; // No keys — return with encrypted blob

  try {
    const payload: HybridEncryptedData = typeof record.encryptedData === 'string'
      ? JSON.parse(record.encryptedData)
      : record.encryptedData;

    const decrypted = await cryptoService.hybridDecrypt(payload, privateKey);

    // Merge decrypted fields back, removing encryptedData
    const { encryptedData: _, ...rest } = record;
    return { ...rest, ...decrypted };
  } catch {
    // Decryption failed — return record as-is (wrong key, corrupted data)
    return record;
  }
}

/**
 * Batch decrypt records.
 */
export async function decryptRecords(
  entityType: EntityType,
  records: Record<string, any>[]
): Promise<Record<string, any>[]> {
  return Promise.all(records.map(r => decryptRecord(entityType, r)));
}

export function getSensitiveFields(entityType: EntityType): string[] {
  return SENSITIVE_FIELDS[entityType] || [];
}
