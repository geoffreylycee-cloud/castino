import React, { useState } from 'react';
import { X, UserCheck, KeyRound } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useUIStore } from '../../stores/useUIStore';

export const AuthModal: React.FC = () => {
  const { authModalOpen, authModalTab, closeAuthModal, openAuthModal, pushToast } = useUIStore();
  const { user, login, register } = useAuthStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!authModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (authModalTab === 'login') {
        await login(username, password);
        pushToast('Bon retour sur CaSTIno !', 'success');
      } else {
        await register(username, password);
        pushToast('Compte sauvegardé avec succès !', 'success');
      }
      setUsername('');
      setPassword('');
      closeAuthModal();
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : 'Erreur d’authentification', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#1a2c38] border border-[#2f4553] rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-[#0f1923] border-b border-[#2f4553]">
          <h2 className="text-lg font-extrabold flex items-center gap-2">
            {authModalTab === 'register' ? (
              <>
                <UserCheck className="w-5 h-5 text-[#00e701]" />
                <span>Créer / Sauvegarder mon Compte</span>
              </>
            ) : (
              <>
                <KeyRound className="w-5 h-5 text-[#00e701]" />
                <span>Connexion Joueur</span>
              </>
            )}
          </h2>
          <button onClick={closeAuthModal} className="text-stake-muted hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-2 gap-2 p-1 bg-[#0f1923] rounded-lg mb-5">
            <button
              type="button"
              onClick={() => openAuthModal('register')}
              className={`py-2 rounded-md text-xs font-bold transition ${
                authModalTab === 'register'
                  ? 'bg-[#213743] text-white'
                  : 'text-stake-muted hover:text-white'
              }`}
            >
              Inscription
            </button>
            <button
              type="button"
              onClick={() => openAuthModal('login')}
              className={`py-2 rounded-md text-xs font-bold transition ${
                authModalTab === 'login'
                  ? 'bg-[#213743] text-white'
                  : 'text-stake-muted hover:text-white'
              }`}
            >
              Connexion
            </button>
          </div>

          {authModalTab === 'register' && user?.isGuest && (
            <div className="mb-4 p-3 rounded-lg bg-[#00e701]/10 border border-[#00e701]/30 text-xs text-emerald-200">
              Votre solde actuel et votre inventaire d&apos;invité ({user.username}) seront
              automatiquement conservés sur votre nouveau compte permanent !
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-stake-muted mb-1">Pseudo</label>
              <input
                type="text"
                required
                minLength={3}
                maxLength={20}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ex: CyberAce"
                className="w-full bg-[#0f1923] border border-[#2f4553] rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#00e701]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stake-muted mb-1">Mot de passe</label>
              <input
                type="password"
                required
                minLength={4}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#0f1923] border border-[#2f4553] rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#00e701]"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-lg bg-[#00e701] hover:bg-[#1fff20] text-[#071824] font-extrabold text-sm shadow-neon transition disabled:opacity-50"
            >
              {submitting
                ? 'Validation...'
                : authModalTab === 'register'
                ? 'Valider mon Compte'
                : 'Se Connecter'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
