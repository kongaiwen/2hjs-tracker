import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Mail, Calendar, Bot, Check, X, ExternalLink, Shield, Lock } from 'lucide-react';
import { googleApi } from '@/lib/api';
import { hasEncryptionKeys } from '@/services/encryptionService';
import { migrateToEncrypted, getEncryptionStatus } from '@/services/dataMigration';
import type { GoogleCalendar } from '@/types';

export default function SettingsPage() {
  const queryClient = useQueryClient();
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

  const { data: googleAuthStatus, isLoading: googleLoading } = useQuery({
    queryKey: ['google-status'],
    queryFn: googleApi.getStatus,
  });

  const { data: authUrl } = useQuery({
    queryKey: ['google-auth-url'],
    queryFn: googleApi.getAuthUrl,
    enabled: !googleAuthStatus?.isAuthenticated,
  });

  const revokeMutation = useMutation({
    mutationFn: googleApi.revoke,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-status'] });
    },
  });

  const { data: calendarList, isLoading: calendarsLoading } = useQuery({
    queryKey: ['google-calendar-list'],
    queryFn: googleApi.getCalendarList,
    enabled: googleAuthStatus?.isAuthenticated === true,
  });

  const { data: preferredCalendar } = useQuery({
    queryKey: ['google-preferred-calendar'],
    queryFn: googleApi.getPreferredCalendar,
    enabled: googleAuthStatus?.isAuthenticated === true,
  });

  const setPreferredCalendarMutation = useMutation({
    mutationFn: (calendarId: string | null) => googleApi.setPreferredCalendar(calendarId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-preferred-calendar'] });
    },
  });

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

        {googleLoading ? (
          <p className="text-muted-foreground">Checking connection status...</p>
        ) : googleAuthStatus?.isAuthenticated ? (
          <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                <Check className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-medium text-green-800">Connected to Google</p>
                <p className="text-sm text-green-600">
                  Gmail and Calendar integration active
                </p>
              </div>
            </div>
            <button
              onClick={() => revokeMutation.mutate()}
              disabled={revokeMutation.isPending}
              className="px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
            >
              {revokeMutation.isPending ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
                <Mail className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">Not connected</p>
                <p className="text-sm text-muted-foreground">
                  Connect to enable email drafts and calendar reminders
                </p>
              </div>
            </div>
            <a
              href={authUrl?.authUrl}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
            >
              Connect Google
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        )}

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

        {googleAuthStatus?.isAuthenticated && (
          <div className="mt-4 p-4 border border-border rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-primary" />
              <h3 className="font-medium">Preferred Calendar</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Choose which calendar 3B and 7B reminders are created on.
            </p>
            {calendarsLoading ? (
              <p className="text-sm text-muted-foreground">Loading calendars...</p>
            ) : (
              <div className="flex items-center gap-3">
                <select
                  className="flex-1 px-3 py-2 border border-border rounded-lg bg-background text-sm"
                  value={preferredCalendar?.calendarId ?? (calendarList?.find(c => c.primary)?.id ?? 'primary')}
                  onChange={(e) => {
                    const primaryId = calendarList?.find(c => c.primary)?.id;
                    const val = e.target.value === primaryId ? null : e.target.value;
                    setPreferredCalendarMutation.mutate(val);
                  }}
                  disabled={setPreferredCalendarMutation.isPending}
                >
                  {(calendarList ?? []).map((cal: GoogleCalendar) => (
                    <option key={cal.id} value={cal.id}>
                      {cal.name}{cal.primary ? ' (Primary)' : ''}
                    </option>
                  ))}
                </select>
                {setPreferredCalendarMutation.isSuccess && (
                  <span className="text-sm text-green-600 flex items-center gap-1">
                    <Check className="w-4 h-4" /> Saved
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Claude API */}
      <div className="bg-card rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Bot className="w-5 h-5" />
          Claude AI Assistant
        </h2>
        <p className="text-muted-foreground mb-4">
          Configure the Claude API key to enable the AI chat assistant for email drafting and job search advice.
        </p>

        <div className="p-4 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground mb-2">
            The Claude API key is configured via environment variables for security.
          </p>
          <p className="text-sm">
            Set <code className="bg-muted px-1 rounded">Z_AI_AUTH_TOKEN</code> in your{' '}
            <code className="bg-muted px-1 rounded">.env</code> file.
          </p>
        </div>

        <div className="mt-4 p-4 border border-border rounded-lg">
          <h3 className="font-medium mb-2">Chat Features</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Draft and review 6-Point Emails</li>
            <li>• Get advice on LAMP list prioritization</li>
            <li>• Generate TIARA questions for informationals</li>
            <li>• Analyze outreach response patterns</li>
          </ul>
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
