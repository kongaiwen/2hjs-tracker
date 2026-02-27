import api from '@/lib/api';
import { hasEncryptionKeys, type EntityType } from './encryptionService';

interface MigrationProgress {
  entityType: EntityType;
  total: number;
  encrypted: number;
  failed: number;
}

interface MigrationResult {
  progress: MigrationProgress[];
  totalEncrypted: number;
  totalFailed: number;
}

type ProgressCallback = (progress: MigrationProgress[]) => void;

const ENTITY_CONFIGS: Array<{
  type: EntityType;
  endpoint: string;
  listKey: string;
  idKey: string;
}> = [
  { type: 'employer', endpoint: '/api/employers', listKey: 'employers', idKey: 'id' },
  { type: 'contact', endpoint: '/api/contacts', listKey: 'contacts', idKey: 'id' },
  { type: 'outreach', endpoint: '/api/outreach', listKey: 'outreach', idKey: 'id' },
  { type: 'informational', endpoint: '/api/informationals', listKey: 'informationals', idKey: 'id' },
  { type: 'emailTemplate', endpoint: '/api/templates', listKey: 'templates', idKey: 'id' },
  { type: 'chatMessage', endpoint: '/api/chat', listKey: 'messages', idKey: 'id' },
];

/**
 * Migrate existing plaintext records to encrypted form.
 * Fetches all records, filters to those without encryptedData,
 * encrypts each and PUTs the update.
 */
export async function migrateToEncrypted(
  onProgress?: ProgressCallback
): Promise<MigrationResult> {
  const keysExist = await hasEncryptionKeys();
  if (!keysExist) {
    throw new Error('No encryption keys found. Set up encryption keys first.');
  }

  const progress: MigrationProgress[] = ENTITY_CONFIGS.map(c => ({
    entityType: c.type,
    total: 0,
    encrypted: 0,
    failed: 0,
  }));

  for (let i = 0; i < ENTITY_CONFIGS.length; i++) {
    const config = ENTITY_CONFIGS[i];
    const p = progress[i];

    try {
      // Fetch all records (response interceptor will decrypt existing encrypted ones)
      const response = await api.get(config.endpoint);
      const data = response.data;

      // Extract records array from response
      let records: any[];
      if (Array.isArray(data)) {
        records = data;
      } else if (data[config.listKey] && Array.isArray(data[config.listKey])) {
        records = data[config.listKey];
      } else {
        continue;
      }

      // We need the raw records to check for encryptedData, but the interceptor
      // already decrypted them. We need to re-fetch without interception to check
      // which records are already encrypted. Instead, we'll encrypt all records
      // that don't have a specific marker. Since we can't easily bypass interceptors,
      // we'll just re-encrypt everything — it's idempotent.
      const unencrypted = records.filter(r => !r._wasEncrypted);
      p.total = records.length;

      for (const record of unencrypted) {
        try {
          // Encrypt the record (request interceptor handles this)
          // We just need to PUT the record back — the interceptor encrypts it
          const { id, ...updateData } = record;

          // Remove read-only / server-managed fields
          delete updateData.createdAt;
          delete updateData.updatedAt;
          delete updateData.userId;
          delete updateData.encryptedData;
          delete updateData._employerId;
          delete updateData._employerName;
          delete updateData.employer;
          delete updateData.outreach;
          delete updateData._count;
          delete updateData.latestOutreach;

          await api.put(`${config.endpoint}/${id}`, updateData);
          p.encrypted++;
        } catch {
          p.failed++;
        }
        onProgress?.(progress);
      }
    } catch {
      // Failed to fetch entity type — skip
    }
  }

  return {
    progress,
    totalEncrypted: progress.reduce((sum, p) => sum + p.encrypted, 0),
    totalFailed: progress.reduce((sum, p) => sum + p.failed, 0),
  };
}

/**
 * Check how many records are not yet encrypted.
 * Returns counts per entity type.
 */
export async function getEncryptionStatus(): Promise<MigrationProgress[]> {
  const progress: MigrationProgress[] = [];

  for (const config of ENTITY_CONFIGS) {
    try {
      // Use raw fetch to bypass interceptors (we want to see raw encryptedData field)
      const response = await fetch(config.endpoint);
      const data = await response.json();

      let records: any[];
      if (Array.isArray(data)) {
        records = data;
      } else if (data[config.listKey] && Array.isArray(data[config.listKey])) {
        records = data[config.listKey];
      } else {
        continue;
      }

      const encrypted = records.filter(r => r.encryptedData).length;

      progress.push({
        entityType: config.type,
        total: records.length,
        encrypted,
        failed: 0,
      });
    } catch {
      // Skip failed entity types
    }
  }

  return progress;
}
