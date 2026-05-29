#!/usr/bin/env bash
# Finalise la branche refactor/security-mois1-semaine1.
# Couvre les chantiers Mois 1 / Mois 2 / Mois 3 + Priorités post-audit.
#
# Lance depuis ton terminal :
#   chmod +x scripts/commit-security-mois1.sh
#   ./scripts/commit-security-mois1.sh

set -euo pipefail

cd "$(dirname "$0")/.."

# 1) Nettoie le verrou git résiduel s'il existe
rm -f .git/index.lock

# 2) Installe toutes les dépendances (Zod, pino, Vitest, Prettier, Husky, lint-staged, etc.)
echo "→ npm install"
npm install

# 3) Régénère le client Prisma (champ mustChangePassword)
echo "→ prisma generate"
npx prisma generate

# 4) Initialise Husky (crée .husky/ et pose le hook pre-commit)
echo "→ Husky init + hook pre-commit"
npx husky init
echo "npx lint-staged" > .husky/pre-commit
chmod +x .husky/pre-commit

# 5) Format Prettier sur tout le repo (une seule fois)
echo "→ Prettier format"
npm run format || true

# 6) Vérifications
echo "→ npm run typecheck"
npm run typecheck
echo "→ npm run lint"
npm run lint
echo "→ npm test"
npm test

# 7) Stage + commit
git add -A

git commit -m "feat(security/quality/devops): roadmap mois 1-3 + priorités post-audit

# Mois 1 — Sécurité
- lib/auth.ts: HS256 pinné, JwtPayload typé, cookies httpOnly
  (setAuthCookie/clearAuthCookie), signJwt, requireAuthCtx, requireRole,
  jsonServerError sans fuite Prisma.
- lib/dsiAdmin.ts: requireDsiAdmin(), requireRoleOrDsiAdmin().
- lib/rate-limit.ts: sliding window in-memory par IP.
- next.config.ts: poweredByHeader=false, compress, output:standalone,
  headers de sécurité (X-Frame, HSTS, Referrer, Permissions, X-CTO).
- proxy.ts: CSP stricte avec nonce par requête (strict-dynamic),
  injection automatique via header x-nonce.
- prisma/schema.prisma: Employee.mustChangePassword.

# Mois 1 — Routes auth durcies
- login: cookie httpOnly, rate-limit 10/10min, Zod, signJwt.
- register: rate-limit 5/1h, Zod, P2002 générique.
- forgot-password: rate-limit 5/30min, Zod.
- reset-password: random 16 chars (crypto.randomBytes), bcrypt,
  email obligatoire (isEmailEnabled), mustChangePassword=true.
- me PUT: currentPassword exigé (bcrypt.compare).
- logout: nouvelle route POST/GET.

# Mois 1 — Validation Zod
- lib/schemas/auth.schema.ts: 5 schémas (login/register/forgot/reset/change).
- lib/validate.ts: parseBody(req, schema).

# Mois 1 — Tests Vitest
- vitest.config.ts + tsconfig.test.json + scripts.
- tests/lib/leave-days.test.ts (15 cas).
- tests/lib/holidays.test.ts (8 cas).
- tests/lib/rate-limit.test.ts (5 cas).
- tests/lib/auth.test.ts (9 cas, dont rejet alg:none).

# Mois 1 — CI
- .github/workflows/ci.yml: quality / build / security.

# Mois 1+2 — Autorisation par rôle (routes critiques)
- /api/employees POST: requireRoleOrDsiAdmin([CEO, ACCOUNTANT]).
- /api/departments POST + [id] PATCH/DELETE: [CEO] ou DSI admin.
- /api/departments/[id]/responsable POST + [rid] PATCH/DELETE: [CEO] ou DSI admin.
- /api/services POST + [id] PATCH/DELETE: [CEO] ou DSI admin.

# Mois 2 — Architecture en couches
- lib/repositories/: employees.repo + departments.repo + services.repo.
- lib/services/: employees.service + departments.service + services.service.
- lib/services/service-error.ts: ServiceError + serviceErrorToResponse.
- 5 routes API migrées vers le pattern parse→service→response.

# Mois 2 — Perf
- next.config.ts: output:standalone.
- pdfjs-dist retiré (dépendance morte).
- Pagination: /api/leaves/inbox + /api/leaves + /api/employees + /api/admin/employees/pending.

# Mois 3 — Docker prod-ready
- USER node (non-root), tini PID 1, HEALTHCHECK HTTP /api/health.
- Copie .next/standalone + .next/static.
- /api/health (ping Mongo).

# Mois 3 — Logger structuré
- lib/logger.ts: pino centralisé, redact des secrets (password/token/cookie).
- logError(route, err, msg, extra?) propagé dans TOUTES les routes API
  (13 routes migrées, 0 console.* restant dans app/api/).

# Mois 3 — Documentation
- README refondu (stack, scripts, archi, sécurité, docker, CI, roadmap).
- CONTRIBUTING (workflow git, conventions, pattern d'ajout de route).
- .env.example complet.

# Post-audit — Qualité
- Prettier + .prettierrc + .prettierignore + .editorconfig.
- Husky pre-commit + lint-staged (Prettier + ESLint --fix).
- Scripts: format, format:check, typecheck.

À faire après ce commit:
- Faire tourner JWT_SECRET, SMTP_PASS, SEED_ADMIN_PASSWORD.
- Migrer les clients localStorage('token') vers cookies.
- Migrer les bulletins PDF Mongo → S3/MinIO (gros chantier).
- Factoriser pages dupliquées leave/new (~2200 lignes, divergence à arbitrer).
"

echo ""
echo "✔ Commit créé sur refactor/security-mois1-semaine1"
echo "  Pour pousser :"
echo "    git push -u origin refactor/security-mois1-semaine1"
echo ""
echo "Étape critique manuelle restante :"
echo "  Fais tourner JWT_SECRET et SMTP_PASS dans ton .env."
echo "  node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\""
