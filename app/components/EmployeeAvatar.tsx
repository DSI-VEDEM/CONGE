"use client";

type EmployeeAvatarProps = {
  firstName?: string | null;
  lastName?: string | null;
  profilePhotoUrl?: string | null;
  size?: number;
};

function initialsFromName(firstName?: string | null, lastName?: string | null) {
  const a = String(firstName ?? "").trim().charAt(0).toUpperCase();
  const b = String(lastName ?? "").trim().charAt(0).toUpperCase();
  return `${a}${b}`.trim() || "??";
}

export default function EmployeeAvatar({
  firstName,
  lastName,
  profilePhotoUrl,
  size = 36,
}: EmployeeAvatarProps) {
  const initials = initialsFromName(firstName, lastName);
  const alt = `${String(firstName ?? "").trim()} ${String(lastName ?? "").trim()}`.trim() || "Employé";

  if (profilePhotoUrl && String(profilePhotoUrl).trim()) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={profilePhotoUrl}
        alt={alt}
        className="rounded-full object-cover border border-vdm-gold-200"
        style={{ width: size, height: size, minWidth: size }}
      />
    );
  }

  return (
    <div
      className="rounded-full bg-vdm-gold-100 text-vdm-gold-800 border border-vdm-gold-200 flex items-center justify-center text-xs font-semibold"
      style={{ width: size, height: size, minWidth: size }}
      aria-label={alt}
      title={alt}
    >
      {initials}
    </div>
  );
}
