import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware Next : génère un nonce par requête et pose une Content-Security-Policy
 * stricte (avec `strict-dynamic`) sur les pages HTML.
 *
 * Pourquoi un middleware et pas `next.config.ts` ?
 * Le nonce DOIT être unique par requête. `headers()` en config statique ne peut
 * pas le générer dynamiquement. Next 16 lit automatiquement l'en-tête `x-nonce`
 * pour injecter le nonce sur ses scripts d'hydratation.
 *
 * En dev, on permet `unsafe-eval` (HMR / React refresh).
 */

const isProd = process.env.NODE_ENV === "production";

function buildCSP(nonce: string): string {
  const scriptSrc = [
    `'self'`,
    `'nonce-${nonce}'`,
    `'strict-dynamic'`,
    isProd ? "" : `'unsafe-eval'`, // HMR
  ]
    .filter(Boolean)
    .join(" ");

  const directives = [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    // Tailwind & CSS-in-JS Next : 'unsafe-inline' nécessaire côté styles.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    `connect-src 'self'`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ];

  return directives.join("; ");
}

export function middleware(request: NextRequest) {
  // Nonce 128 bits encodé en base64 — Web Crypto disponible dans le runtime edge.
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const nonce = Buffer.from(nonceBytes).toString("base64");

  const csp = buildCSP(nonce);

  // Le nonce est propagé dans les headers REQUEST pour que Next l'injecte
  // automatiquement sur ses balises <script> d'hydratation.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);

  return response;
}

export const config = {
  // On exclut les statiques (/_next/static, /_next/image, favicon, robots, sitemap)
  // pour réduire le coût du middleware. Les routes API et pages sont couvertes.
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
