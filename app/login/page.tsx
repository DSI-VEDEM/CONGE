"use client";

import { Suspense, useEffect, useState } from "react";
import { Eye, EyeOff, User, Lock } from "lucide-react";
import toast from "react-hot-toast";
import { useSearchParams } from "next/navigation";
import { hasRequiredProfileData, routeForRole } from "@/lib/auth-client";

function normIdentifier(v: string) {
  const s = v.trim();
  return s.includes("@") ? s.toLowerCase() : s; // email => lowercase, matricule => intact
}

function LoginContent() {
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState(""); // email OU matricule
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get("pending") === "1") {
      toast("Compte en attente de validation par l'admin.");
    }
    if (searchParams.get("validated") === "1") {
      toast.success("Votre compte est valide. Vous pouvez vous connecter.");
    }
  }, [searchParams]);

  const handleSubmit = async () => {
    const identifierTrim = normIdentifier(identifier);

    if (!identifierTrim || !password) {
      toast.error("Veuillez remplir tous les champs");
      return;
    }

    setIsLoading(true);
    const loadingToast = toast.loading("Connexion en cours...");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifierTrim, password }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 403) {
          toast.error(data.error || "Compte en attente de validation par l'admin.", { id: loadingToast });
          return;
        }

        toast.error(data.error || "Identifiants incorrects", { id: loadingToast });
        return;
      }

      // API => { token, employee: {...} }
      localStorage.setItem("token", data.token);
      localStorage.setItem("employee", JSON.stringify(data.employee));

      toast.success("Connexion réussie", { id: loadingToast });

      const role = data.employee.role as "CEO" | "ACCOUNTANT" | "DEPT_HEAD" | "SERVICE_HEAD" | "EMPLOYEE" | undefined;
      const isDsiAdmin = Boolean(data.employee.isDsiAdmin);
      const departmentType = (data.employee.departmentType ?? null) as "DAF" | "DSI" | "OPERATIONS" | "OTHERS" | string | null;
      const nextRoute = !hasRequiredProfileData(data.employee)
        ? "/onboarding"
        : role
          ? routeForRole(role, isDsiAdmin, departmentType)
          : "/dashboard";
      window.location.href = nextRoute;
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
          <h1 className="text-5xl font-bold mb-6">Bienvenue</h1>
          <p className="text-xl opacity-90">Connectez-vous pour accéder à votre espace personnel.</p>
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
              <h2 className="text-3xl font-bold text-vdm-gold-800 mb-2">Connexion</h2>
              <p className="text-gray-600">Entrez vos identifiants pour continuer</p>
              <p className="text-xs text-vdm-gold-700 mt-2">
                {searchParams.get("pending") === "1"
                  ? "Votre compte n'est pas encore valide, patientez quelques instants."
                  : "Votre compte est valide. Connectez-vous pour continuer."}
              </p>
            </div>

            <div className="space-y-6">
              {/* Identifier */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email ou matricule</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
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

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Mot de passe</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="********"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-vdm-gold-500"
                    disabled={isLoading}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-vdm-gold-600 hover:text-vdm-gold-700"
                    disabled={isLoading}
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <div className="mt-3 text-right">
                  <a
                    href="/forgot-password"
                    className="text-sm text-vdm-gold-600 font-semibold hover:text-vdm-gold-700 hover:underline"
                  >
                    Mot de passe oublié ?
                  </a>
                </div>
              </div>

              {/* Button */}
              <button
                onClick={handleSubmit}
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-vdm-gold-500 to-vdm-gold-700 text-white py-3 rounded-lg font-semibold disabled:opacity-50"
              >
                {isLoading ? "Connexion..." : "Se connecter"}
              </button>
            </div>

            <p className="mt-8 text-center text-sm text-gray-600">
              Pas encore de compte ?{" "}
              <a href="/register" className="text-vdm-gold-600 font-semibold hover:text-vdm-gold-700 hover:underline">
                Créer un compte
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Chargement...</div>}>
      <LoginContent />
    </Suspense>
  );
}
