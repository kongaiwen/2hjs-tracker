import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CryptoService } from '@/services/cryptoService';
import { KeyManager } from '@/services/keyManager';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

export function KeySetupPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';

  const [step, setStep] = useState<'generating' | 'download'>('generating');
  const [generatedKeys, setGeneratedKeys] = useState<{ publicKey: string; privateKey: string } | null>(null);
  const [keyDownloaded, setKeyDownloaded] = useState(false);
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const crypto = new CryptoService();
  const keyManager = new KeyManager();

  useEffect(() => {
    generateKeys();
  }, []);

  const generateKeys = async () => {
    try {
      const keyPair = await crypto.generateKeyPair();
      const publicKey = await crypto.exportKey(keyPair.publicKey);
      const privateKey = await crypto.exportPrivateKey(keyPair.privateKey);

      setGeneratedKeys({ publicKey, privateKey });

      // Store keys locally
      await keyManager.storeKeys({ publicKey, privateKey });

      setStep('download');
    } catch (err) {
      alert('Failed to generate keys');
    }
  };

  const downloadKeys = () => {
    if (!generatedKeys) return;

    const blob = new Blob([JSON.stringify(generatedKeys, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `2hjs-keys-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    setKeyDownloaded(true);
  };

  const completeSetup = async () => {
    if (!generatedKeys) return;

    try {
      const response: any = await authApi.completeRegistration(token, generatedKeys.publicKey, email);
      setAuth({ id: response.userId, email }, response.token);
      navigate('/');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Setup failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold mb-6">Set Up Your Encryption Keys</h1>

        {step === 'generating' && (
          <div className="text-center">
            <div className="animate-spin text-4xl mb-4">⚙️</div>
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
              <h3 className="font-semibold text-yellow-800 mb-2">⚠️ Important: Download Your Keys</h3>
              <p className="text-sm text-yellow-700 mb-3">
                If you lose access to this device or clear your browser data, you'll need this
                file to recover your account.
              </p>
              <button
                onClick={downloadKeys}
                className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
              >
                Download Key File
              </button>
              {keyDownloaded && (
                <p className="text-sm text-green-600 mt-2">✓ Downloaded!</p>
              )}
            </div>

            <div className="bg-gray-50 rounded p-4">
              <h4 className="font-semibold mb-2">Your Key Fingerprint</h4>
              <code className="text-xs bg-gray-200 px-2 py-1 rounded break-all">
                {crypto.fingerprintFromPEM(generatedKeys.publicKey)}
              </code>
              <p className="text-xs text-gray-600 mt-2">
                Save this fingerprint to verify your keys in the future.
              </p>
            </div>

            <button
              onClick={completeSetup}
              disabled={!keyDownloaded}
              className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 disabled:opacity-50"
            >
              Complete Setup
            </button>

            {!keyDownloaded && (
              <p className="text-xs text-gray-500 text-center">
                Please download your keys before continuing
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
