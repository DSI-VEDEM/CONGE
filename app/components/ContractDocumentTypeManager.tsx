"use client";

import { FormEvent, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { getToken } from "@/lib/auth-client";
import type { ContractDocumentType } from "@/app/hooks/useContractDocumentTypes";

type Props = {
  contractDocumentTypes: ContractDocumentType[];
  onRefresh: () => Promise<void>;
};

export default function ContractDocumentTypeManager({ contractDocumentTypes, onRefresh }: Props) {
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isListExpanded, setIsListExpanded] = useState(false);

  const sortedTypes = useMemo(
    () => [...contractDocumentTypes].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [contractDocumentTypes]
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("Nom du type requis");
      return;
    }
    const token = getToken();
    if (!token) {
      toast.error("Session invalide");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/contract-document-types", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(String(data?.error ?? "Impossible d'ajouter le type"));
        return;
      }
      toast.success("Type ajouté");
      setName("");
      await onRefresh();
    } catch {
      toast.error("Erreur réseau lors de l'ajout du type");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (typeId: string, typeName: string) => {
    if (!window.confirm(`Supprimer le type "${typeName}" ? Cette action est irréversible.`)) return;
    const token = getToken();
    if (!token) {
      toast.error("Session invalide");
      return;
    }
    setDeletingId(typeId);
    try {
      const res = await fetch(`/api/contract-document-types/${typeId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(String(data?.error ?? "Impossible de supprimer le type"));
        return;
      }
      toast.success("Type supprimé");
      await onRefresh();
    } catch {
      toast.error("Erreur réseau lors de la suppression");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="bg-white border border-vdm-gold-200 rounded-xl p-4 mb-6">
      <div className="text-lg font-semibold text-vdm-gold-800 mb-2">Types de documents de contrats</div>
      <p className="text-sm text-vdm-gold-700 mb-3">
        Ajoutez ici de nouvelles catégories de documents de contrats pour mieux qualifier les fichiers déposés par la
        comptabilité.
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2 flex-wrap">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex : Contrat de travail"
          className="flex-1 min-w-[220px] border border-vdm-gold-200 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
        />
        <button
          type="submit"
          disabled={isSaving}
          className="px-3 py-2 rounded-md bg-vdm-gold-700 text-white text-sm hover:bg-vdm-gold-800 disabled:opacity-60"
        >
          {isSaving ? "Ajout..." : "Ajouter"}
        </button>
      </form>
      <div className="mt-4 flex items-center justify-between text-xs text-vdm-gold-600">
        <span>Types existants ({contractDocumentTypes.length})</span>
        <button
          type="button"
          className="text-vdm-gold-700 hover:underline focus:outline-none"
          onClick={() => setIsListExpanded((prev) => !prev)}
          aria-expanded={isListExpanded}
        >
          {isListExpanded ? "Masquer" : "Afficher"}
        </button>
      </div>
      {sortedTypes.length > 0 ? (
        isListExpanded ? (
          <ul className="mt-2 space-y-2 text-sm text-vdm-gold-700">
            {sortedTypes.map((type) => (
              <li key={type.id} className="flex items-center justify-between gap-3">
                <div>
                  <div>{type.name}</div>
                  <div className="text-xs text-vdm-gold-500">
                    {new Date(type.createdAt).toLocaleString("fr-FR", { dateStyle: "short" })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(type.id, type.name)}
                  className="text-xs text-red-600 hover:underline"
                  disabled={deletingId === type.id}
                >
                  {deletingId === type.id ? "Suppression..." : "Supprimer"}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-vdm-gold-500">Liste repliée. Cliquez sur "Afficher" pour voir les types.</p>
        )
      ) : (
        <p className="mt-2 text-sm text-vdm-gold-700">Aucun type défini pour le moment.</p>
      )}
    </div>
  );
}
