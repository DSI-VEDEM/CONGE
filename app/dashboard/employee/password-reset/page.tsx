"use client";

import PasswordResetCard from "./PasswordResetCard";

export default function EmployeePasswordResetPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="text-xl font-semibold mb-1 text-vdm-gold-800">Réinitialisation du mot de passe</div>
        <div className="text-sm text-vdm-gold-700 mb-4">
          Votre compte est protégé. En cas d&apos;oubli, la DSI se charge de remettre un mot de passe par défaut puis vous pourrez définir une nouvelle clé.
        </div>
      </div>
      <PasswordResetCard />
    </div>
  );
}
