"use client";

import { Lock } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { getToken } from "@/lib/auth-client";

export default function PasswordResetCard() {
  const [isLoading, setIsLoading] = useState(false);
  const token = getToken();

  const handleRequestReset = async () => {
    if (!token) {
      toast.error("Vous devez être connecté pour demander une réinitialisation.");
      return;
    }
    if (isLoading) return;
    setIsLoading(true);
    const loadingToast = toast.loading("Notification envoyée à la DSI...");
    try {
      const response = await fetch("/api/auth/me/request-reset", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error || "Impossible de contacter la DSI.", { id: loadingToast });
        return;
      }
      toast.success("La DSI a bien reçu votre demande.", { id: loadingToast });
    } catch {
      toast.error("Erreur réseau. Veuillez réessayer.", { id: loadingToast });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex gap-3">
        <div className="rounded-full bg-vdm-gold-100 p-3 text-vdm-gold-800">
          <Lock className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-1">
          <p className="text-sm font-semibold text-vdm-gold-800">Réinitialisation du mot de passe</p>
          <p className="text-xs text-gray-600">
            Oubliez votre mot de passe ? La DSI recevra une alerte et pourra appliquer le mot de passe par défaut.
          </p>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handleRequestReset}
          disabled={isLoading}
          className="rounded-full bg-vdm-gold-700 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white shadow-sm transition hover:bg-vdm-gold-800 disabled:opacity-60"
        >
          {isLoading ? "Envoi..." : "Demander une réinitialisation"}
        </button>
      </div>
    </div>
  );
}
