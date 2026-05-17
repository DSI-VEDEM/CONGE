#!/usr/bin/env bash
# Finalise les corrections sur la branche refactor/security-mois1-semaine1.
# Couvre les chantiers Mois 1 / Mois 2 / Mois 3 du plan de remédiation.
#
# Lance ce script depuis le terminal sur ta machine :
#   chmod +x scripts/commit-security-mois1.sh
#   ./scripts/commit-security-mois1.sh

set -euo pipefail

cd "$(dirname "$0")/.."

# 1) Nettoie le verrou git résiduel s'il existe
rm -f .git/index.lock

# 2) Réinstalle proprement les dépendances (Zod, pino, pino-pretty, Vitest, etc. ajoutés au package.json)
echo "→ npm install"
npm install

# 3) Régénère le client Prisma (nouveau champ mustChangePassword)
echo "→ prisma generate"
npx prisma generate

# 4) Vérifications
echo "→ npm run typecheck"
npm run typecheck
echo "→ npm run lint"
npm run lint
echo "→ npm test"
npm test

# 5) Stage + commit
git add -A

git commit -m "feat(security/quality/devops): roadmap mois 1-3 — durcissement, validation, tests, CI, docker prod-ready

# Mois 1 — Sécurité
- lib/auth.ts: pin HS256, typage JwtPayload, helpers cookies httpOnly
  (setAuthCookie/clearAuthCookie/AUTH_COOKIE_NAME), signJwt centralisé,
  requireAuthCtx, requireRole(roles), jsonServerError() qui masque les
  détails Prisma en prod. Lecture du token cookie puis fallback Bearer.
- lib/dsiAdmin.ts: nouveaux helpers requireDsiAdmin() et
  requireRoleOrDsiAdmin() reposant sur l'admin DSI déjà existant.
- lib/rate-limit.ts: rate-limit in-memory par IP (sliding window).
- next.config.ts: poweredByHeader=false, compress=true, output:standalone,
  headers de sécurité (X-Content-Type-Options, X-Frame-Options,
  Referrer-Policy, Permissions-Policy, HSTS en prod). CSP commentée en TODO.
- prisma/schema.prisma: nouveau champ Employee.mustChangePassword.

# Mois 1 — Routes API durcies
- /api/auth/login: cookie httpOnly, rate-limit 10/10min, signJwt (HS256),
  validation Zod.
- /api/auth/register: rate-limit 5/1h, validation Zod (email/longueurs/CGU),
  message P2002 générique.
- /api/auth/forgot-password: rate-limit 5/30min, validation Zod, plus de
  leak err.code/err.message.
- /api/auth/reset-password: mot de passe aléatoire 16 chars
  (crypto.randomBytes), bcrypt, envoi email via lib/email, flag
  mustChangePassword=true. Fin du ChangeMe123! par défaut.
- /api/auth/me PUT: exige currentPassword pour changer le mot de passe.
- /api/auth/logout: nouvelle route POST/GET qui efface le cookie.
- /api/employees POST: requireRoleOrDsiAdmin([CEO, ACCOUNTANT]).
  Migrée vers la couche service (lib/services/employees.service.ts).
- /api/departments POST/PATCH/DELETE + /[id]/responsable POST/PATCH/DELETE:
  requireRoleOrDsiAdmin([CEO]).
- /api/services POST/PATCH/DELETE: requireRoleOrDsiAdmin([CEO]).
- /api/leaves/inbox GET: pagination cursor (take/skip).

# Mois 1 — Validation Zod
- lib/schemas/auth.schema.ts: loginSchema, registerSchema,
  forgotPasswordSchema, resetPasswordSchema, changePasswordSchema.
- lib/validate.ts: parseBody(req, schema) wrapper d'erreurs uniforme
  (issues Zod converties en map field→message).

# Mois 1 — Tests Vitest
- vitest.config.ts + tsconfig.test.json + scripts test/test:watch/test:coverage.
- tests/lib/leave-days.test.ts (15 tests): countCalendarDaysInclusive,
  countWeekdaysInclusive, countLeaveDaysInclusive, computeReturnDate, etc.
- tests/lib/holidays.test.ts (8 tests): RECURRING_HOLIDAY_ANCHOR_YEAR,
  expandRecurringAnchorToYear (29 février), utcYearRange, etc.
- tests/lib/rate-limit.test.ts (5 tests): bucket par IP, blocage au max,
  reset par fenêtre.
- tests/lib/auth.test.ts (9 tests): cookie/Bearer, alg:none rejeté,
  requireRole 401/403, jsonError/jsonServerError.

# Mois 1 — CI
- .github/workflows/ci.yml: 3 jobs (quality / build / security).
  quality = lint + typecheck + prisma validate + test.
  build = next build avec vars d'env placeholders.
  security = npm audit informatif (non bloquant).
- concurrency cancel-in-progress sur la branche.

# Mois 2 — Architecture
- lib/repositories/ (nouveau): couche d'accès données. Premier module:
  employees.repo.ts avec createEmployee/searchEmployees/findEmployeeById.
- lib/services/ (nouveau): couche métier. Premier module:
  employees.service.ts qui orchestre Prisma + bcrypt et lance ServiceError.
- lib/services/service-error.ts: ServiceError + serviceErrorToResponse()
  pour traduire en réponse HTTP.
- /api/employees POST migrée comme exemple — pattern reproductible.

# Mois 2 — Perf
- next.config.ts: output:standalone (image Docker ~3x plus petite),
  compress, poweredByHeader=false.
- pdfjs-dist retiré du package.json (dépendance morte, 0 import).
- /api/leaves/inbox: pagination (take/skip + total).

# Mois 3 — Dockerfile prod-ready
- USER node (non-root).
- tini comme PID 1 (gestion SIGTERM propre).
- HEALTHCHECK HTTP sur /api/health.
- Copie de .next/standalone + .next/static (au lieu de tout node_modules).
- /api/health: route 200/503 selon ping Mongo.

# Mois 3 — Logger structuré
- lib/logger.ts: pino centralisé. JSON en prod, pino-pretty en dev.
  Redact automatique de password/token/headers.authorization.

# Mois 3 — Documentation
- README.md: refonte (stack, scripts, archi en couches, sécurité, docker,
  CI, roadmap, workflow congés en mermaid).
- CONTRIBUTING.md (nouveau): workflow git, conventions de commit, pattern
  pour ajouter une route API, règles de sécurité, tests.
- .env.example (nouveau): toutes les vars documentées (DB, JWT, SMTP, LOG,
  CRON_SECRET, etc.).
- .gitignore: autorise .env.example.

À faire après ce commit :
- Faire tourner JWT_SECRET, SMTP_PASS, SEED_ADMIN_PASSWORD (ex-.env)
- Migrer le front qui lit encore localStorage('token') vers les cookies
  (le serveur accepte les deux pour transition).
- Migrer les bulletins de paie PDF de MongoDB vers blob storage (S3/MinIO).
- Activer une CSP stricte (avec nonces) après tests.
- Factoriser app/dashboard/*/leave/new/page.tsx (700+ lignes × 3 variantes).
"

echo ""
echo "✔ Commit créé sur refactor/security-mois1-semaine1"
echo "  Pour pousser :"
echo "    git push -u origin refactor/security-mois1-semaine1"
echo ""
echo "Étape critique manuelle restante :"
echo "  Fais tourner JWT_SECRET et SMTP_PASS dans ton .env (sécurité)."
