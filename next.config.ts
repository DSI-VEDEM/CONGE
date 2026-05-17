import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/// Headers de sécurité globaux appliqués à toutes les routes.
/// CSP désactivée par défaut : l'activer après tests (Next.js a besoin
/// d'inline scripts pour l'hydratation — préférer une CSP avec nonces).
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
  // TODO: activer une CSP stricte (avec nonces) une fois validée :
  // { key: "Content-Security-Policy", value: "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'nonce-...'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
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
