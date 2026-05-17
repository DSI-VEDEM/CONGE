import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/// Headers de sécurité globaux appliqués à toutes les routes.
/// La CSP n'est PAS gérée ici : elle est dynamique (nonce par requête) et
/// posée par `middleware.ts` à la racine.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  // Optimise l'image Docker : copie .next/standalone + .next/static au lieu de tout node_modules.
  output: "standalone",
  poweredByHeader: false,
  compress: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
