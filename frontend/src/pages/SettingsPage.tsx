import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Mail, Calendar, Check, X, Shield, Lock } from 'lucide-react';
import { hasEncryptionKeys } from '@/services/encryptionService';
import { migrateToEncrypted, getEncryptionStatus } from '@/services/dataMigration';

export default function SettingsPage() {
  const [searchParams] = useSearchParams();
  const googleStatus = searchParams.get('google');

  // ── Data Encryption state ──────────────────────────────────────────────────
  const [keysAvailable, setKeysAvailable] = useState(false);
  const [encryptionStatus, setEncryptionStatus] = useState<Array<{
    entityType: string; total: number; encrypted: number;
  }>>([]);
  const [migrating, setMigrating] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState<Array<{
    entityType: string; total: number; encrypted: number; failed: number;
  }>>([]);

  useEffect(() => {
    hasEncryptionKeys().then(setKeysAvailable);
  }, []);

  useEffect(() => {
    if (keysAvailable) {
      getEncryptionStatus().then(setEncryptionStatus);
    }
  }, [keysAvailable]);

  const handleMigrate = async () => {
    setMigrating(true);
    try {
      await migrateToEncrypted((progress) => {
        setMigrationProgress([...progress]);
      });
      // Refresh status after migration
      const status = await getEncryptionStatus();
      setEncryptionStatus(status);
    } finally {
      setMigrating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure integrations and preferences
        </p>
      </div>

      {/* Google OAuth Status */}
      {googleStatus === 'success' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <Check className="w-5 h-5 text-green-600" />
          <span className="text-green-800">Successfully connected to Google!</span>
        </div>
      )}
      {googleStatus === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <X className="w-5 h-5 text-red-600" />
          <span className="text-red-800">Failed to connect to Google. Please try again.</span>
        </div>
      )}

      {/* Google Integration */}
      <div className="bg-card rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Mail className="w-5 h-5" />
          Google Integration
        </h2>
        <p className="text-muted-foreground mb-4">
          Connect your Google account to create Gmail drafts and calendar reminders for the 3B7 routine.
        </p>

        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
              <Mail className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Coming Soon</p>
              <p className="text-sm text-muted-foreground">
                Google Calendar and Gmail integration is not yet available on the current platform.
              </p>
            </div>
          </div>
          <span className="px-4 py-2 bg-muted text-muted-foreground rounded-lg cursor-not-allowed opacity-50">
            Connect Google
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="p-4 border border-border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Mail className="w-4 h-4 text-primary" />
              <h3 className="font-medium">Gmail</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Create draft emails directly from 6-Point Email templates
            </p>
          </div>
          <div className="p-4 border border-border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-primary" />
              <h3 className="font-medium">Calendar</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Automatically create 3B and 7B reminders when sending outreach
            </p>
          </div>
        </div>

      </div>

      {/* Data Encryption */}
      {keysAvailable && (
        <div className="bg-card rounded-lg border border-border p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Data Encryption
          </h2>
          <p className="text-muted-foreground mb-4">
            Your data is encrypted end-to-end using AES-256-GCM. New records are encrypted automatically.
            Use the migration tool below to encrypt existing plaintext records.
          </p>

          {/* Encryption status */}
          {encryptionStatus.length > 0 && (
            <div className="space-y-2 mb-4">
              {encryptionStatus.map((s) => {
                const pct = s.total > 0 ? Math.round((s.encrypted / s.total) * 100) : 100;
                return (
                  <div key={s.entityType} className="flex items-center gap-3">
                    <span className="text-sm w-28 capitalize">{s.entityType}s</span>
                    <div className="flex-1 bg-muted rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-sm text-muted-foreground w-24 text-right">
                      {s.encrypted}/{s.total} ({pct}%)
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Migration progress (while running) */}
          {migrating && migrationProgress.length > 0 && (
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm font-medium text-blue-800 mb-2">Encrypting records...</p>
              {migrationProgress.map((p) => (
                <p key={p.entityType} className="text-sm text-blue-700">
                  {p.entityType}: {p.encrypted} encrypted{p.failed > 0 ? `, ${p.failed} failed` : ''}
                </p>
              ))}
            </div>
          )}

          <button
            onClick={handleMigrate}
            disabled={migrating}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            <Lock className="w-4 h-4" />
            {migrating ? 'Encrypting...' : 'Encrypt All Data'}
          </button>
        </div>
      )}

      {/* About */}
      <div className="bg-card rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold mb-4">About 2HJS Tracker</h2>
        <p className="text-muted-foreground mb-4">
          A comprehensive job search management application based on Steve Dalton's
          "2-Hour Job Search" methodology.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="font-medium mb-2">Key Concepts</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• <strong>LAMP List</strong>: Prioritize employers</li>
              <li>• <strong>6-Point Email</strong>: Effective outreach</li>
              <li>• <strong>3B7 Routine</strong>: Track follow-ups</li>
              <li>• <strong>TIARA</strong>: Informational questions</li>
            </ul>
          </div>
          <div>
            <h3 className="font-medium mb-2">Contact Segments</h3>
            <ul className="text-sm space-y-1">
              <li className="text-green-600">• <strong>Boosters</strong>: Respond within 3B</li>
              <li className="text-yellow-600">• <strong>Obligates</strong>: Delayed, reluctant</li>
              <li className="text-red-600">• <strong>Curmudgeons</strong>: Never respond</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
