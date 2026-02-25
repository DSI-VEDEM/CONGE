"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import toast from "react-hot-toast";

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    const value = identifier.trim();
    if (!value) {
      toast.error("Veuillez saisir votre email ou matricule.");
      return;
    }

    setIsLoading(true);
    const loadingToast = toast.loading("Envoi en cours...");

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: value }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error || "Erreur réseau. Veuillez réessayer.", { id: loadingToast });
        return;
      }

      toast.success("Si un compte existe, un lien a été envoyé.", { id: loadingToast });
      setIdentifier("");
    } catch {
      toast.error("Erreur réseau. Veuillez réessayer.", { id: loadingToast });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isLoading) handleSubmit();
  };

  return (
    <div className="min-h-screen flex">
      {/* LEFT */}
      <div className="hidden lg:flex lg:w-1/2 lg:sticky lg:top-0 lg:h-screen lg:overflow-hidden bg-gradient-to-br from-vdm-gold-600 via-vdm-gold-500 to-vdm-gold-200 p-12 flex-col justify-center items-center text-white">
        <div className="max-w-md text-center">
          <div className="mb-8 h-28 w-28 flex items-center justify-center overflow-hidden mx-auto">
            <img src="/logo.jpeg" alt="Logo" className="h-24 w-24 object-contain" />
          </div>
          <h1 className="text-5xl font-bold mb-6">Mot de passe oublié</h1>
          <p className="text-xl opacity-90">
            Recevez un lien de réinitialisation pour accéder à votre compte.
          </p>
        </div>
      </div>

      {/* RIGHT */}
      <div className="flex-1 flex items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="text-center mb-8">
              <div className="lg:hidden mx-auto mb-4 h-16 w-16 flex items-center justify-center overflow-hidden">
                <img src="/logo.jpeg" alt="Logo" className="h-14 w-14 object-contain" />
              </div>
              <h2 className="text-3xl font-bold text-vdm-gold-800 mb-2">Réinitialisation</h2>
              <p className="text-gray-600">Saisissez votre email ou matricule</p>
              <p className="text-xs text-vdm-gold-700 mt-2">Un email vous sera envoyé si le compte existe.</p>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email ou matricule</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="ex : admin@domaine.com ou PDG-001"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-vdm-gold-500"
                    disabled={isLoading}
                    autoComplete="username"
                  />
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-vdm-gold-500 to-vdm-gold-700 text-white py-3 rounded-lg font-semibold disabled:opacity-50"
              >
                {isLoading ? "Envoi..." : "Envoyer le lien"}
              </button>
            </div>

            <p className="mt-8 text-center text-sm text-gray-600">
              Retour à{" "}
              <a href="/login" className="text-vdm-gold-600 font-semibold hover:text-vdm-gold-700 hover:underline">
                la connexion
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
