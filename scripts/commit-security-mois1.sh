#!/usr/bin/env bash
# Finalise le commit de la branche refactor/security-mois1-semaine1.
# Lance ce script depuis le terminal sur ta machine (pas depuis Cowork) :
#   chmod +x scripts/commit-security-mois1.sh
#   ./scripts/commit-security-mois1.sh

set -euo pipefail

cd "$(dirname "$0")/.."

# 1) Nettoie le verrou git résiduel s'il existe
rm -f .git/index.lock

# 2) Régénère le client Prisma (nouveau champ mustChangePassword)
npx prisma generate

# 3) Vérifie que tsc et lint passent
npx tsc --noEmit
npx eslint app/api/auth lib/auth.ts lib/rate-limit.ts next.config.ts

# 4) Stage + commit
git add \
  app/api/auth/forgot-password/route.ts \
  app/api/auth/login/route.ts \
  app/api/auth/logout/route.ts \
  app/api/auth/me/route.ts \
  app/api/auth/register/route.ts \
  app/api/auth/reset-password/route.ts \
  lib/auth.ts \
  lib/rate-limit.ts \
  next.config.ts \
  prisma/schema.prisma \
  scripts/commit-security-mois1.sh

git commit -m "security(mois1-s1): durcissement auth + headers + rate-limit

- lib/auth.ts: pin HS256, typage JwtPayload, helpers cookies httpOnly
  (setAuthCookie/clearAuthCookie), requireAuthCtx, requireRole(roles),
  jsonServerError pour ne plus fuiter les details Prisma en prod.
  Lecture du token via cookie puis fallback header Authorization.
- lib/rate-limit.ts (nouveau): rate-limit in-memory par IP avec
  rateLimitResponse() (429 + Retry-After).
- next.config.ts: poweredByHeader=false, compress=true, headers de
  securite (X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
  Permissions-Policy, HSTS en prod). CSP commentee en TODO.
- /api/auth/login: emet cookie httpOnly, rate-limit 10/10min,
  utilise signJwt (HS256), masque les details d'erreur 500.
- /api/auth/register: rate-limit 5/1h, message Prisma P2002 generique,
  plus de leak err.code/err.message.
- /api/auth/logout (nouveau): route POST/GET qui efface le cookie.
- /api/auth/forgot-password: rate-limit 5/30min, plus de leak err.
- /api/auth/reset-password: genere un mot de passe aleatoire 16 chars
  via crypto.randomBytes, hash bcrypt, envoie par email, flag
  mustChangePassword=true. Supprime le defaut ChangeMe123!.
- /api/auth/me PUT: exige currentPassword pour changer le mot de
  passe (verifie via bcrypt.compare avant ecriture). Une fois
  change volontairement, mustChangePassword repasse a false.
- prisma/schema.prisma: nouveau champ Employee.mustChangePassword
  (Boolean @default(false)).

À faire après ce commit:
- Faire tourner JWT_SECRET, SMTP_PASS, SEED_ADMIN_PASSWORD (.env)
- Migrer les clients front qui lisent localStorage('token') vers
  les cookies (le serveur accepte deja les deux pour compat).
- Ajouter requireRole(...) cote serveur sur les 56 routes API
  qui n'ont pour l'instant que verifyJwt.
"
echo ""
echo "✔ Commit créé sur refactor/security-mois1-semaine1"
echo "  Pour pousser : git push -u origin refactor/security-mois1-semaine1"
