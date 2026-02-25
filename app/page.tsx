export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <main className="w-full max-w-2xl px-6 py-16 text-center">
        <div className="mx-auto max-w-xl space-y-6">
          <img
            src="/logo.jpeg"
            alt="Logo Veilleur des médias"
            className="mx-auto h-24 w-auto"
          />
          <h1 className="text-3xl font-bold tracking-tight text-vdm-gold-800 sm:text-4xl">
            Bienvenue chez Veilleur des médias
          </h1>
          <p className="text-base text-gray-600 sm:text-lg">
            Connectez-vous pour accéder à votre espace personnel RH.
          </p>
          <a
            href="/login"
            className="inline-flex items-center justify-center rounded-lg bg-vdm-gold-700 px-6 py-3 text-white font-semibold hover:bg-vdm-gold-800 transition"
          >
            Connexion
          </a>
        </div>
      </main>
    </div>
  );
}
