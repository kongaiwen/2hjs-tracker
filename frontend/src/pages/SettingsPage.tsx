import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Mail, Calendar, Check, X, Shield, Lock, Key, Download, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { hasEncryptionKeys } from '@/services/encryptionService';
import { migrateToEncrypted, getEncryptionStatus } from '@/services/dataMigration';
import { CryptoService } from '@/services/cryptoService';
import { KeyManager } from '@/services/keyManager';
import { authApi, googleApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

export default function SettingsPage() {
  const [searchParams] = useSearchParams();
  const googleStatus = searchParams.get('google');
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);

  // ── Data Encryption state ──────────────────────────────────────────────────
  const [keysAvailable, setKeysAvailable] = useState(false);
  const [encryptionStatus, setEncryptionStatus] = useState<Array<{
    entityType: string; total: number; encrypted: number;
  }>>([]);
  const [migrating, setMigrating] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState<Array<{
    entityType: string; total: number; encrypted: number; failed: number;
  }>>([]);

  // ── Key Sync state ────────────────────────────────────────────────────────
  const [showPassphraseForm, setShowPassphraseForm] = useState(false);
  const [currentPassphrase, setCurrentPassphrase] = useState('');
  const [newPassphrase, setNewPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [keySyncError, setKeySyncError] = useState('');
  const [keySyncSuccess, setKeySyncSuccess] = useState('');
  const [savingPassphrase, setSavingPassphrase] = useState(false);

  // ── Delete All Data state ───────────────────────────────────────────────────
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deletingData, setDeletingData] = useState(false);

  // ── Google Integration state ─────────────────────────────────────────────────
  const [googleAuthStatus, setGoogleAuthStatus] = useState<{ isAuthenticated: boolean; isExpired: boolean | null } | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleCalendars, setGoogleCalendars] = useState<Array<{ id: string; name: string; primary: boolean }>>([]);
  const [googlePreferredCalendar, setGooglePreferredCalendar] = useState<string | null>(null);
  const [googleError, setGoogleError] = useState('');

  const crypto = new CryptoService();
  const keyManager = new KeyManager();

  useEffect(() => {
    hasEncryptionKeys().then(setKeysAvailable);
  }, []);

  useEffect(() => {
    if (keysAvailable) {
      getEncryptionStatus().then(setEncryptionStatus);
    }
  }, [keysAvailable]);

  // Load Google auth status on mount
  useEffect(() => {
    loadGoogleStatus();
  }, []);

  // Load Google calendars when authenticated
  useEffect(() => {
    if (googleAuthStatus?.isAuthenticated && !googleAuthStatus.isExpired) {
      loadGoogleCalendars();
    }
  }, [googleAuthStatus]);

  const loadGoogleStatus = async () => {
    try {
      const status = await googleApi.getStatus();
      setGoogleAuthStatus(status);
      if (status.isAuthenticated) {
        const preferred = await googleApi.getPreferredCalendar();
        setGooglePreferredCalendar(preferred.calendarId);
      }
    } catch {
      setGoogleAuthStatus({ isAuthenticated: false, isExpired: null });
    }
  };

  const loadGoogleCalendars = async () => {
    try {
      const calendars = await googleApi.getCalendarList();
      setGoogleCalendars(calendars);
    } catch (err) {
      console.error('Failed to load calendars:', err);
    }
  };

  const handleGoogleConnect = async () => {
    setGoogleLoading(true);
    setGoogleError('');
    try {
      const { authUrl } = await googleApi.getAuthUrl();
      window.location.href = authUrl;
    } catch (err: any) {
      setGoogleError(err.response?.data?.error || 'Failed to connect to Google');
      setGoogleLoading(false);
    }
  };

  const handleGoogleRevoke = async () => {
    setGoogleLoading(true);
    setGoogleError('');
    try {
      await googleApi.revoke();
      setGoogleAuthStatus({ isAuthenticated: false, isExpired: null });
      setGoogleCalendars([]);
      setGooglePreferredCalendar(null);
    } catch (err: any) {
      setGoogleError(err.response?.data?.error || 'Failed to revoke access');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSetPreferredCalendar = async (calendarId: string) => {
    setGoogleLoading(true);
    setGoogleError('');
    try {
      await googleApi.setPreferredCalendar(calendarId);
      setGooglePreferredCalendar(calendarId);
    } catch (err: any) {
      setGoogleError(err.response?.data?.error || 'Failed to set preferred calendar');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleMigrate = async () => {
    setMigrating(true);
    try {
      await migrateToEncrypted((progress) => {
        setMigrationProgress([...progress]);
      });
      const status = await getEncryptionStatus();
      setEncryptionStatus(status);
    } finally {
      setMigrating(false);
    }
  };

  const handleDownloadKeys = async () => {
    const keys = await keyManager.getKeys();
    if (keys) {
      keyManager.downloadKeys(keys);
    }
  };

  const handleSetPassphrase = async () => {
    setKeySyncError('');
    setKeySyncSuccess('');

    if (newPassphrase.length < 12) {
      setKeySyncError('Passphrase must be at least 12 characters.');
      return;
    }
    if (newPassphrase !== confirmPassphrase) {
      setKeySyncError('Passphrases do not match.');
      return;
    }

    // If updating existing passphrase, verify old one first
    if (user?.hasWrappedKey && !currentPassphrase) {
      setKeySyncError('Please enter your current passphrase to verify.');
      return;
    }

    setSavingPassphrase(true);
    try {
      // Verify current passphrase if updating
      if (user?.hasWrappedKey) {
        const { wrappedPrivateKey } = await authApi.getWrappedKey();
        if (wrappedPrivateKey) {
          try {
            const wrapped = JSON.parse(wrappedPrivateKey);
            await crypto.unwrapPrivateKey(wrapped, currentPassphrase);
          } catch {
            setKeySyncError('Current passphrase is incorrect.');
            setSavingPassphrase(false);
            return;
          }
        }
      }

      const keys = await keyManager.getKeys();
      if (!keys) {
        setKeySyncError('No encryption keys found in this browser.');
        setSavingPassphrase(false);
        return;
      }

      const wrapped = await crypto.wrapPrivateKey(keys.privateKey, newPassphrase);
      const keyFingerprint = await crypto.fingerprintFromPEM(keys.publicKey);

      // Send both wrapped key AND fingerprint to server
      await authApi.updateKeys(keys.publicKey, keyFingerprint, undefined, JSON.stringify(wrapped));
      updateUser({ hasWrappedKey: true, keyFingerprint });

      setKeySyncSuccess('Recovery passphrase saved successfully.');
      setShowPassphraseForm(false);
      setCurrentPassphrase('');
      setNewPassphrase('');
      setConfirmPassphrase('');
    } catch (err: any) {
      setKeySyncError(err.response?.data?.error || 'Failed to save passphrase.');
    } finally {
      setSavingPassphrase(false);
    }
  };

  const handleDeleteAllData = async () => {
    setDeleteError('');
    setDeletingData(true);
    try {
      await authApi.deleteAllData();
      // Reload the page to clear any cached data
      window.location.reload();
    } catch (err: any) {
      setDeleteError(err.response?.data?.error || 'Failed to delete data. Please try again.');
      setDeletingData(false);
    }
  };

  const fingerprint = user?.keyFingerprint;

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

        {googleError && (
          <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
            <p className="text-sm text-red-700">{googleError}</p>
          </div>
        )}

        {/* Connection Status */}
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              googleAuthStatus?.isAuthenticated ? 'bg-green-100' : 'bg-muted'
            }`}>
              {googleAuthStatus?.isAuthenticated ? (
                <Check className="w-5 h-5 text-green-600" />
              ) : (
                <Mail className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <p className="font-medium">
                {googleAuthStatus?.isAuthenticated ? 'Connected to Google' : 'Not Connected'}
              </p>
              <p className="text-sm text-muted-foreground">
                {googleAuthStatus?.isAuthenticated
                  ? 'Gmail drafts and calendar integration enabled'
                  : 'Connect to enable Gmail and Calendar features'}
              </p>
            </div>
          </div>
          {googleAuthStatus?.isAuthenticated ? (
            <button
              onClick={handleGoogleRevoke}
              disabled={googleLoading}
              className="px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50"
            >
              {googleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Revoke Access'}
            </button>
          ) : (
            <button
              onClick={handleGoogleConnect}
              disabled={googleLoading}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
            >
              {googleLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4" />
                  Connect Google
                </>
              )}
            </button>
          )}
        </div>

        {/* Feature Description */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 border border-border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Mail className="w-4 h-4 text-primary" />
              <h3 className="font-medium">Gmail Drafts</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Create draft emails directly from 6-Point Email templates
            </p>
          </div>
          <div className="p-4 border border-border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-primary" />
              <h3 className="font-medium">Calendar Reminders</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Automatically create 3B and 7B reminders when sending outreach
            </p>
          </div>
        </div>

        {/* Calendar Selection (when connected) */}
        {googleAuthStatus?.isAuthenticated && googleCalendars.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <h3 className="font-medium mb-2">Preferred Calendar</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Select which calendar to use for creating 3B and 7B reminders
            </p>
            <div className="space-y-2">
              {googleCalendars.map((cal) => (
                <button
                  key={cal.id}
                  onClick={() => handleSetPreferredCalendar(cal.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${
                    googlePreferredCalendar === cal.id || (!googlePreferredCalendar && cal.primary)
                      ? 'bg-primary/10 border-primary'
                      : 'bg-muted/30 border-border hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span className="text-sm font-medium">{cal.name}</span>
                    {cal.primary && <span className="text-xs text-muted-foreground">(primary)</span>}
                  </div>
                  {(googlePreferredCalendar === cal.id || (!googlePreferredCalendar && cal.primary)) && (
                    <Check className="w-4 h-4 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
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

      {/* Key Sync */}
      {keysAvailable && (
        <div className="bg-card rounded-lg border border-border p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Key className="w-5 h-5" />
            Key Sync
          </h2>
          <p className="text-muted-foreground mb-4">
            Manage your recovery passphrase and key file for accessing encrypted data on other devices.
          </p>

          {keySyncError && (
            <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
              <p className="text-sm text-red-700">{keySyncError}</p>
            </div>
          )}
          {keySyncSuccess && (
            <div className="bg-green-50 border border-green-200 rounded p-3 mb-4">
              <p className="text-sm text-green-700">{keySyncSuccess}</p>
            </div>
          )}

          <div className="space-y-4">
            {/* Status */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div>
                <p className="text-sm font-medium">Recovery passphrase</p>
                <p className="text-xs text-muted-foreground">
                  {user?.hasWrappedKey
                    ? 'Set — you can restore your keys on other devices using your passphrase'
                    : 'Not set — you can only restore from the key file'}
                </p>
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded ${
                user?.hasWrappedKey
                  ? 'bg-green-100 text-green-700'
                  : 'bg-yellow-100 text-yellow-700'
              }`}>
                {user?.hasWrappedKey ? 'Set' : 'Not set'}
              </span>
            </div>

            {/* Fingerprint */}
            {fingerprint && (
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div>
                  <p className="text-sm font-medium">Key fingerprint</p>
                  <code className="text-xs text-muted-foreground">{fingerprint}</code>
                </div>
              </div>
            )}

            {/* Passphrase form */}
            {showPassphraseForm ? (
              <div className="border border-border rounded-lg p-4 space-y-3">
                {user?.hasWrappedKey && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Current Passphrase</label>
                    <input
                      type="password"
                      value={currentPassphrase}
                      onChange={(e) => { setCurrentPassphrase(e.target.value); setKeySyncError(''); }}
                      placeholder="Enter current passphrase"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {user?.hasWrappedKey ? 'New Passphrase' : 'Passphrase'}
                  </label>
                  <input
                    type="password"
                    value={newPassphrase}
                    onChange={(e) => { setNewPassphrase(e.target.value); setKeySyncError(''); }}
                    placeholder="At least 12 characters"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {newPassphrase.length > 0 && newPassphrase.length < 12 && (
                    <p className="text-xs text-red-500 mt-1">Must be at least 12 characters</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Confirm Passphrase</label>
                  <input
                    type="password"
                    value={confirmPassphrase}
                    onChange={(e) => { setConfirmPassphrase(e.target.value); setKeySyncError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSetPassphrase()}
                    placeholder="Re-enter passphrase"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {confirmPassphrase && newPassphrase !== confirmPassphrase && (
                    <p className="text-xs text-red-500 mt-1">Passphrases do not match</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowPassphraseForm(false);
                      setCurrentPassphrase('');
                      setNewPassphrase('');
                      setConfirmPassphrase('');
                      setKeySyncError('');
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSetPassphrase}
                    disabled={savingPassphrase || newPassphrase.length < 12 || newPassphrase !== confirmPassphrase}
                    className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50"
                  >
                    {savingPassphrase ? 'Saving...' : (user?.hasWrappedKey ? 'Update Passphrase' : 'Set Passphrase')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowPassphraseForm(true); setKeySyncSuccess(''); setKeySyncError(''); }}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90"
                >
                  <Key className="w-4 h-4" />
                  {user?.hasWrappedKey ? 'Update Passphrase' : 'Set Passphrase'}
                </button>

                <button
                  onClick={handleDownloadKeys}
                  className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted/50"
                >
                  <Download className="w-4 h-4" />
                  Download Key File
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete All Data */}
      <div className="bg-card rounded-lg border border-red-200 p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-red-700">
          <Trash2 className="w-5 h-5" />
          Danger Zone
        </h2>
        <p className="text-muted-foreground mb-4">
          Permanently delete all your tracked data. This will remove all employers, contacts, outreach records,
          informational interviews, and templates. This action cannot be undone.
        </p>

        {showDeleteConfirm ? (
          <div className="border border-red-300 rounded-lg p-4 bg-red-50 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-red-800">Are you absolutely sure?</h3>
                <p className="text-sm text-red-700 mt-1">
                  This will permanently delete all your data including:
                </p>
                <ul className="text-sm text-red-700 mt-2 list-disc list-inside">
                  <li>All employers and LAMP list entries</li>
                  <li>All contacts</li>
                  <li>All outreach records and follow-ups</li>
                  <li>All informational interview records</li>
                  <li>All email templates</li>
                  <li>All settings</li>
                </ul>
              </div>
            </div>

            {deleteError && (
              <div className="bg-red-100 border border-red-300 rounded p-3">
                <p className="text-sm text-red-800">{deleteError}</p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteError(''); }}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
                disabled={deletingData}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAllData}
                disabled={deletingData}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deletingData ? (
                  <>Deleting...</>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Yes, Delete All My Data
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 border border-red-300 text-red-700 rounded-lg text-sm hover:bg-red-50 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete All Data
          </button>
        )}
      </div>

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
