"use client";

import ProfileView from "@/app/components/ProfileView";
import { PROFILE_DOCUMENT_TYPES } from "@/app/components/EmployeeDocumentsSection";

export default function EmployeeProfilePage() {
  return (
    <div className="p-6">
      <div className="text-xl font-semibold mb-1 text-vdm-gold-800">Profil</div>
      <div className="text-sm text-vdm-gold-700 mb-4">Vos informations personnelles.</div>
      <ProfileView documentTypes={PROFILE_DOCUMENT_TYPES} />
    </div>
  );
}
