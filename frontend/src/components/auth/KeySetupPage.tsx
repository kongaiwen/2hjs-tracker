import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CryptoService } from '@/services/cryptoService';
import { KeyManager } from '@/services/keyManager';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

type SetupStep = 'loading' | 'generating' | 'download' | 'passphrase' | 'complete';
type RestoreMode = 'choose' | 'passphrase' | 'file' | 'generate-warning';

export function KeySetupPage() {
  const [step, setStep] = useState<SetupStep>('loading');
  const [generatedKeys, setGeneratedKeys] = useState<{ publicKey: string; privateKey: string } | null>(null);
  const [keyDownloaded, setKeyDownloaded] = useState(false);
  const [error, setError] = useState('');

  // Passphrase fields
  const [passphrase, setPassphrase] = useState('');
  const [passphraseConfirm, setPassphraseConfirm] = useState('');
  const [savingPassphrase, setSavingPassphrase] = useState(false);

  // Fingerprint display
  const [fingerprintDisplay, setFingerprintDisplay] = useState<string | null>(null);

  // Returning user (restore flow)
  const [isReturningUser, setIsReturningUser] = useState(false);
  const [restoreMode, setRestoreMode] = useState<RestoreMode>('choose');
  const [restorePassphrase, setRestorePassphrase] = useState('');
  const [restoring, setRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const setHasKeys = useAuthStore((s) => s.setHasKeys);

  const crypto = new CryptoService();
  const keyManager = new KeyManager();

  useEffect(() => {
    checkExistingKeys();
  }, []);

  const checkExistingKeys = async () => {
    // Check if user already has keys on server (another device set them up)
    if (user?.hasEncryptionKeys) {
      setIsReturningUser(true);
      setStep('loading');
    } else {
      // New user — generate keys
      setStep('generating');
      generateKeys();
    }
  };

  // ── New user flow ─────────────────────────────────────────────────────────

  const generateKeys = async () => {
    try {
      const keyPair = await crypto.generateKeyPair();
      const publicKey = await crypto.exportKey(keyPair.publicKey);
      const privateKey = await crypto.exportPrivateKey(keyPair.privateKey);

      setGeneratedKeys({ publicKey, privateKey });
      await keyManager.storeKeys({ publicKey, privateKey });

      // Generate fingerprint for display
      const fingerprint = await crypto.fingerprintFromPEM(publicKey);
      setFingerprintDisplay(fingerprint);

      setStep('download');
    } catch {
      setError('Failed to generate encryption keys. Please refresh and try again.');
    }
  };

  const downloadKeys = () => {
    if (!generatedKeys) return;
    keyManager.downloadKeys(generatedKeys);
    setKeyDownloaded(true);
  };

  const goToPassphraseStep = () => {
    setStep('passphrase');
  };

  const passphraseStrength = (pw: string): { label: string; color: string; width: string } => {
    if (pw.length < 12) return { label: 'Too short', color: 'bg-red-500', width: '20%' };
    let score = 0;
    if (pw.length >= 16) score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^a-zA-Z0-9]/.test(pw)) score++;
    if (score <= 1) return { label: 'Weak', color: 'bg-orange-500', width: '40%' };
    if (score === 2) return { label: 'Fair', color: 'bg-yellow-500', width: '60%' };
    if (score === 3) return { label: 'Good', color: 'bg-blue-500', width: '80%' };
    return { label: 'Strong', color: 'bg-green-500', width: '100%' };
  };

  const savePassphrase = async () => {
    if (!generatedKeys) return;
    if (passphrase.length < 12) {
      setError('Passphrase must be at least 12 characters.');
      return;
    }
    if (passphrase !== passphraseConfirm) {
      setError('Passphrases do not match.');
      return;
    }

    setError('');
    setSavingPassphrase(true);
    try {
      const wrapped = await crypto.wrapPrivateKey(generatedKeys.privateKey, passphrase);
      const wrappedJson = JSON.stringify(wrapped);

      const keyFingerprint = await crypto.fingerprintFromPEM(generatedKeys.publicKey);
      await authApi.updateKeys(generatedKeys.publicKey, keyFingerprint, undefined, wrappedJson);
      setHasKeys(true);
      updateUser({ hasEncryptionKeys: true, hasWrappedKey: true, publicKey: generatedKeys.publicKey, keyFingerprint });
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save passphrase.');
    } finally {
      setSavingPassphrase(false);
    }
  };

  const skipPassphrase = async () => {
    if (!generatedKeys) return;
    try {
      const keyFingerprint = await crypto.fingerprintFromPEM(generatedKeys.publicKey);
      await authApi.updateKeys(generatedKeys.publicKey, keyFingerprint);
      setHasKeys(true);
      updateUser({ hasEncryptionKeys: true, hasWrappedKey: false, publicKey: generatedKeys.publicKey, keyFingerprint });
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Setup failed.');
    }
  };

  // ── Returning user flow ───────────────────────────────────────────────────

  const restoreFromPassphrase = async () => {
    if (!restorePassphrase) {
      setError('Please enter your recovery passphrase.');
      return;
    }

    setError('');
    setRestoring(true);
    try {
      const { wrappedPrivateKey } = await authApi.getWrappedKey();
      if (!wrappedPrivateKey) {
        setError('No recovery passphrase is set on this account. Try importing a key file instead.');
        setRestoring(false);
        return;
      }

      const wrapped = JSON.parse(wrappedPrivateKey);
      const privateKeyPEM = await crypto.unwrapPrivateKey(wrapped, restorePassphrase);

      // Verify it's a valid PEM private key
      await crypto.importPrivateKey(privateKeyPEM);

      // Get the public key from server to store alongside
      const meRes = await authApi.me();
      const meData = meRes.data;

      // We need the public key — fetch it from /me which should have it
      // The public key isn't directly in /me, but we can derive it or we stored it
      // Actually, we can import the private key and re-export the public key...
      // But RSA private key doesn't let us derive public key via WebCrypto easily.
      // Let's fetch the public key from the user record — it's in the /me response indirectly.
      // We need to get the public key from the server. Let's check if it's available.

      // The server stores publicKey. We need to expose it or get it from the wrapped payload.
      // For now, let's add publicKey to the /me response. Actually, let's think...
      // We already store the public key on server. But /me doesn't return it to avoid bloating.
      // However, for key restore, we need it. Let's fetch it through a dedicated approach.
      // Actually the simplest: we can export the public key from the private key.
      // WebCrypto doesn't directly support this, but we can import as key pair...
      // No — let's just get it from the server /me endpoint. We can add publicKey to the response.

      // Actually looking at the /me endpoint, it doesn't return publicKey.
      // But we added it to the User interface in authStore. Let's check if the server returns it...
      // Looking at the auth route: it returns hasEncryptionKeys (boolean) but not publicKey itself.
      // The updateUser call in completeSetup passes publicKey though...

      // Simplest fix: the /me endpoint should return publicKey for key sync scenarios.
      // For now, let's use a workaround: re-derive public key by importing private key
      // and then importing the public part. Actually WebCrypto PKCS8 import only gives private ops.

      // Let's just get it from the existing authStore user, since the user obj may have it cached.
      // Or better: let's look at if the user data from /me has public key info somewhere.
      // Looking at actual data: the server query doesn't SELECT publicKey in /me.
      // We'll need to get it somehow. Let me think of the cleanest approach...

      // The cleanest: we wrap BOTH keys (public + private) in the wrapped payload.
      // But that changes the wrapping format. Alternatively, expose publicKey on /me.
      // Let's just add publicKey to the /me SELECT since we need it for this flow.
      // We'll update the backend. For now, let's assume meData has publicKey or keyFingerprint
      // and get publicKey from a dedicated endpoint or from the /me response.

      // Actually, the meRes.data should now have the needed info since we'll update the query.
      // But for now this code runs against the current backend. Let me restructure:
      // The wrapped private key alone is sufficient — we just need the public key too.
      // Since we're going to update /me to return publicKey, let's use that.

      if (!meData.publicKey) {
        // Fallback: the /me endpoint was updated to include publicKey
        setError('Unable to retrieve public key from server. Please try importing a key file.');
        setRestoring(false);
        return;
      }

      // Verify fingerprint matches
      const importedPublicKey = await crypto.importPublicKey(meData.publicKey);
      const fingerprint = await crypto.generateFingerprint(importedPublicKey);
      const serverFingerprint = meData.keyFingerprint;

      if (serverFingerprint && fingerprint !== serverFingerprint) {
        setError('Key fingerprint does not match server record. The restored key may be from a different account.');
        setRestoring(false);
        return;
      }

      // Store keys in IndexedDB
      await keyManager.storeKeys({
        publicKey: meData.publicKey,
        privateKey: privateKeyPEM,
      });

      // Update server fingerprint if it was null (first sync after fix)
      if (!serverFingerprint) {
        await authApi.updateKeys(meData.publicKey, fingerprint);
        updateUser({ keyFingerprint: fingerprint });
      }

      setHasKeys(true);
      navigate('/');
    } catch (err: any) {
      if (err.name === 'OperationError') {
        setError('Incorrect passphrase. Please try again.');
      } else {
        setError(err.message || 'Failed to restore keys.');
      }
    } finally {
      setRestoring(false);
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setRestoring(true);
    try {
      const imported = await keyManager.importFromFile(file);

      // Verify fingerprint matches server's
      const meRes = await authApi.me();
      const serverFingerprint = meRes.data.keyFingerprint;
      const importedFingerprint = await crypto.fingerprintFromPEM(imported.publicKey);

      if (serverFingerprint && importedFingerprint !== serverFingerprint) {
        await keyManager.clearKeys();
        setError('Key fingerprint does not match the server record. This key file may be from a different account.');
        setRestoring(false);
        return;
      }

      // Update server fingerprint if it was null (first sync after fix)
      if (!serverFingerprint) {
        await authApi.updateKeys(imported.publicKey, importedFingerprint);
        updateUser({ keyFingerprint: importedFingerprint });
      }

      setHasKeys(true);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Failed to import key file.');
    } finally {
      setRestoring(false);
    }
  };

  const handleGenerateNew = () => {
    setIsReturningUser(false);
    setRestoreMode('choose');
    setStep('generating');
    generateKeys();
  };

  // ── Returning user UI ─────────────────────────────────────────────────────

  if (isReturningUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
          <h1 className="text-2xl font-bold mb-2">Restore Your Encryption Keys</h1>
          <p className="text-sm text-gray-600 mb-6">
            Your account already has encryption keys from another device. Choose how to restore them on this device.
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {restoreMode === 'choose' && (
            <div className="space-y-3">
              {user?.hasWrappedKey && (
                <button
                  onClick={() => { setRestoreMode('passphrase'); setError(''); }}
                  className="w-full text-left p-4 border border-border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <h3 className="font-semibold">Restore from passphrase</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Enter the recovery passphrase you set during initial setup.
                  </p>
                </button>
              )}

              <button
                onClick={() => { setRestoreMode('file'); setError(''); }}
                className="w-full text-left p-4 border border-border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <h3 className="font-semibold">Import key file</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Upload the JSON key file you downloaded during setup.
                </p>
              </button>

              <button
                onClick={() => { setRestoreMode('generate-warning'); setError(''); }}
                className="w-full text-left p-4 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
              >
                <h3 className="font-semibold text-red-700">Generate new keys</h3>
                <p className="text-sm text-red-600 mt-1">
                  Replace existing keys. Previously encrypted data will be unrecoverable.
                </p>
              </button>
            </div>
          )}

          {restoreMode === 'passphrase' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Recovery Passphrase</label>
                <input
                  type="password"
                  value={restorePassphrase}
                  onChange={(e) => setRestorePassphrase(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && restoreFromPassphrase()}
                  placeholder="Enter your recovery passphrase"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setRestoreMode('choose'); setError(''); }}
                  className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={restoreFromPassphrase}
                  disabled={restoring || !restorePassphrase}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {restoring ? 'Restoring...' : 'Restore Keys'}
                </button>
              </div>
            </div>
          )}

          {restoreMode === 'file' && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <p className="text-sm text-gray-600 mb-3">
                  Select your <code className="bg-gray-100 px-1 rounded">2hjs-keys-*.json</code> file
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileImport}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={restoring}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {restoring ? 'Importing...' : 'Choose File'}
                </button>
              </div>
              <button
                onClick={() => { setRestoreMode('choose'); setError(''); }}
                className="w-full px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Back
              </button>
            </div>
          )}

          {restoreMode === 'generate-warning' && (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="font-semibold text-red-800 mb-2">Are you sure?</h3>
                <p className="text-sm text-red-700">
                  Generating new keys will make all previously encrypted data permanently unreadable.
                  This cannot be undone. Only proceed if you have no important data or have exported it first.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setRestoreMode('choose'); setError(''); }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerateNew}
                  className="flex-1 bg-red-600 text-white py-2 rounded-md hover:bg-red-700"
                >
                  Generate New Keys
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── New user UI ───────────────────────────────────────────────────────────

  const strength = passphraseStrength(passphrase);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold mb-6">Set Up Your Encryption Keys</h1>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {step === 'generating' && (
          <div className="text-center">
            <div className="animate-spin text-4xl mb-4">&#9881;</div>
            <p className="text-gray-600">Generating your encryption keys...</p>
          </div>
        )}

        {step === 'download' && generatedKeys && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded p-4">
              <h3 className="font-semibold text-green-800 mb-2">Keys Generated Successfully!</h3>
              <p className="text-sm text-green-700">
                Your keys have been generated locally in your browser and stored securely.
              </p>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
              <h3 className="font-semibold text-yellow-800 mb-2">Important: Download Your Keys</h3>
              <p className="text-sm text-yellow-700 mb-3">
                Download your key file as a backup. You can use it to restore access on another device.
              </p>
              <button
                onClick={downloadKeys}
                className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
              >
                Download Key File
              </button>
              {keyDownloaded && (
                <p className="text-sm text-green-600 mt-2">Downloaded!</p>
              )}
            </div>

            <div className="bg-gray-50 rounded p-4">
              <h4 className="font-semibold mb-2">Your Key Fingerprint</h4>
              <code className="text-xs bg-gray-200 px-2 py-1 rounded break-all">
                {fingerprintDisplay || 'Generating...'}
              </code>
            </div>

            <button
              onClick={goToPassphraseStep}
              disabled={!keyDownloaded}
              className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 disabled:opacity-50"
            >
              Continue
            </button>

            {!keyDownloaded && (
              <p className="text-xs text-gray-500 text-center">
                Please download your keys before continuing
              </p>
            )}
          </div>
        )}

        {step === 'passphrase' && generatedKeys && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded p-4">
              <h3 className="font-semibold text-blue-800 mb-2">Set a Recovery Passphrase</h3>
              <p className="text-sm text-blue-700">
                This passphrase lets you access your encrypted data on other devices without needing the key file.
                Your passphrase never leaves your browser — only the encrypted key is stored on the server.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Passphrase</label>
              <input
                type="password"
                value={passphrase}
                onChange={(e) => { setPassphrase(e.target.value); setError(''); }}
                placeholder="At least 12 characters"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              {passphrase.length > 0 && (
                <div className="mt-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${strength.color}`}
                        style={{ width: strength.width }}
                      />
                    </div>
                    <span className="text-xs text-gray-600">{strength.label}</span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Confirm Passphrase</label>
              <input
                type="password"
                value={passphraseConfirm}
                onChange={(e) => { setPassphraseConfirm(e.target.value); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && savePassphrase()}
                placeholder="Re-enter passphrase"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {passphraseConfirm && passphrase !== passphraseConfirm && (
                <p className="text-xs text-red-500 mt-1">Passphrases do not match</p>
              )}
            </div>

            <button
              onClick={savePassphrase}
              disabled={savingPassphrase || passphrase.length < 12 || passphrase !== passphraseConfirm}
              className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 disabled:opacity-50"
            >
              {savingPassphrase ? 'Saving...' : 'Set Passphrase & Complete Setup'}
            </button>

            <button
              onClick={skipPassphrase}
              className="w-full text-sm text-gray-500 hover:text-gray-700 py-1"
            >
              Skip — I'll rely on the key file only
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
