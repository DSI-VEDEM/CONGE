# Guide de maintenance technique

Ce document est destiné à un.e développeur.se qui doit maintenir l’application en votre absence : il résume la stack, les dépendances critiques, les commandes clés et les invariants métiers que l'on retrouve dans cette base de code Next.js + Prisma + MongoDB.

## 1. Vue d'ensemble
- **Stack** : Next.js 16 (App Router), React 19, Tailwind CSS 4, Prisma 6 avec MongoDB, react-hot-toast pour les notifications, récharts + pdf-lib pour certains exports.
- **Structure principale** :
  - `app/` contient les pages, layouts et API routes du front (App Router).
  - `app/api` héberge les routes REST internes (auth, congés, documents, etc.).
  - `app/components`, `app/hooks`, `dashboard/` centralisent la logique partagée et les UI par rôle.
  - `lib/` et `generated/prisma` regroupent les helpers et le client Prisma généré.
  - `prisma/` contient le schéma Mongo (voir section dédiée) et le script de seed.

## 2. Technologies utilisées et leur rôle
- **Next.js 16 (App Router)** : structure des pages (`app/`), routage serveur (API routes dans `app/api/`) et rendu hybride (SSR/ISR).
- **React 19 + Tailwind CSS 4** : UI déclarative (`app/components`, `dashboard/`, `login/`, etc.) avec classes utilitaires et thèmes.
- **Prisma 6 + MongoDB** : ORM type-safe vers Mongo (`prisma/schema.prisma`, clients générés dans `generated/prisma` et `node_modules/.prisma/client`). Modélise `Employee`, `LeaveRequest`, `LeaveDecision`, `Department`, `Service`, `LeaveBlackout`, documents et bulletins.
- **react-hot-toast** : notifications toast côté client (succès, erreurs des routes API).
- **recharts** : graphiques (solde des congés, répartition des demandes) dans les dashboards.
- **pdf-lib** : génération de PDF (bulletins, relevés) exportés depuis l’interface.
- **@heroicons/react + lucide-react** : icônes utilisées par les boutons et cartes stat dans `app/components` et `dashboard`.
- **bcryptjs** : hachage des mots de passe dans les routes d’auth (`app/api/auth`).
- **jsonwebtoken** : création/validation des JWT (helpers `lib/auth`, middleware).
- **dotenv** : lecture des `.env` / `.env.production`.
- **@zxcvbn-ts/core`, `language-common`, `language-fr`** : robustesse des mots de passe dans les formulaires d’inscription/connexion.
- **ts-node** : exécution du seed (`prisma/seed.ts`).
- **Docker + docker compose** : packaging dev/prod. Compose lance Next + Mongo (`mongo:7.0`) et monte `.:/app`.
- **Node 20 / npm** : runtime ; `npm install` déclenche `prisma generate` via `postinstall`.
- **PostCSS + Tailwind CLI** : compilation/stylisation (`@tailwindcss/postcss`).

## 3. Pré-requis et configuration
- **Node & npm** : utiliser une version compatible avec Next 16+ (Node 20 recommandé car les dépendances TypeScript visent `@types/node@^20`).
- **MongoDB** : une instance Mongo 7+ accessible via `DATABASE_URL`.
- **Fichier `.env`** minimum :
  ```
  DATABASE_URL=
  JWT_SECRET=
  DEPT_HEAD_VALIDATION_DAYS=5
  CEO_DIRECTOR_VALIDATION_DAYS=2
  LEAVE_AUTO_APPROVE_SECRET=
  SEED_ADMIN_PASSWORD=ChangeMe123!
  ```
  Les variables peuvent être surchargées dans `.env.production` lorsque vous déployez.
- **Autres fichiers générés** :
  - `generated/prisma` : client Prisma orienté runtime.
  - `node_modules/.prisma/client` : copie locale utilisée par Prisma Client.

## 4. Installation & initialisation
1. `npm install` (installe les dépendances et déclenche `prisma generate` via `postinstall`).
2. `npx prisma db push` pour synchroniser le schéma avec Mongo, puis `npx prisma generate` (si vous modifiez le schéma).
3. `npm run seed` (ou `ts-node --transpile-only prisma/seed.ts`) pour créer les comptes de base (CEO, DSI/admin, comptable, directeur des opérations + trois sous-directeurs, services, responsabilités). Le script est idempotent ; on peut relancer plusieurs fois sans dupliquer les utilisateurs.
4. `./scripts/check-seed.sh` (ou avec `-c <compose-file>`) confirme la présence des comptes seedés.

## 5. Commandes fréquemment utilisées
- `npm run dev` : dev server Next avec hot reload (localhost:3000).
- `npm run build` puis `npm run start` : build + démarrage production (sans hot reload).
- `npm run lint` : vérifie la cohérence du code avec ESLint.
- `npm run seed` : recrée les comptes essentiels (voir ci-dessus).
- Docker :
  - Dév rapide : `docker compose up --build` fait tourner l'app et Mongo localement (`mongo:7.0`), avec volume `.:/app`.
  - Prod : `docker build -t conge:latest --target runner .` pour construire l’image et `docker run --rm -p 3000:3000 --env-file .env conge:latest` pour la lancer.

## 6. Architecture métier & flux principaux
- **Rôles** (cf. `prisma/schema.prisma` enums) : `CEO`, `ACCOUNTANT`, `DEPT_HEAD`, `SERVICE_HEAD`, `EMPLOYEE`. Les dashboards et contrôles d’accès sont principalement basés sur ces rôles.
- **Workflow des congés** :
  - `LeaveRequest` escalade des responsables jusqu’au CEO.
  - `LeaveDecision` enregistre les actions (submit, approve, reject, escalate, comment, cancel).
  - Statuts (`LeaveStatus`) : `SUBMITTED`, `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`.
  - La logique de validation agit sur les champs `currentAssigneeId`, `deptHeadAssignedAt`, `reachedCeoAt`.
- Les demandes touchent automatiquement le solde annuel (`leaveBalance` + `leaveBalanceAdjustment` sur `Employee`).
- **Relations Mongo/Prisma** (extraits clés du schéma) :
  - `Department` → services, membres, responsabilités, `LeaveBlackout`.
  - `Service` lié à `Department` avec unique sur `[departmentId, type]`.
  - `Employee` relié aux `Department`, `Service`, `LeaveRequest`, `LeaveDecision`, `SalarySlip`, `EmployeeDocument`.
  - `SalarySlip` et `EmployeeDocument` conservent fichiers en base (`fileDataUrl`), indexés pour éviter les duplications.

## 7. Dossiers critiques à connaître
- `app/api` : API internes ; chaque fichier `.ts` correspond à une route / middleware côté serveur.
- `app/dashboard` : tableaux de bord par rôle (CEO, Comptable, Responsable, Employé). C’est ici qu'on trouve les vues et logiques des workflows.
- `app/components` & `app/hooks` : composants réutilisables, helpers UI (ex. `hooks/useLeaveRequests`).
- `app/onboarding`, `app/register`, `app/login`, `app/forgot-password` : chemins d’authentification.
- `lib/` : helpers partagés (auth tokens, utils).
- `prisma/seed.ts` : script TypeScript qui crée les comptes de base et les relations de départ.

## 8. Maintenance récurrente & bons réflexes
- **Surveiller les contraintes Mongo** : la collection `Employee` comporte des indexes sur `role`, `status`, `departmentId`, `serviceId`. Les requêtes de congés utilisent `@@index` pour accélérer les filtres (`status`, `currentAssigneeId`, `createdAt`, etc.).
- **Congés et soldes** : à chaque validation, vérifier que `leaveBalance` est décrémenté et qu’un historique (`LeaveDecision`) est créé. Les modifs de workflow doivent impérativement propager les changements dans les décisions tout en mettant à jour `LeaveRequest.updatedAt`.
- **Documents & bulletins** :
  - `EmployeeDocument` et `SalarySlip` stockent des fichiers encodés (`fileDataUrl`). Respecter les `mimeType`/`fileName` pour éviter les collisions.
  - Vérifier les relations `uploadedBy`, `signedBy`.
- **Logique d’accès** : les UI Dashboard filtrent selon `employee.role`; les protections serveur se trouvent dans `app/api` (middleware).

## 9. Débogage & vérifications
- **Reproduire un bug** : redémarrer `npm run dev` + `docker compose up --build` pour reproduire dans un environnement proche de la prod.
- **Prisma** :
  - Après un changement de schéma, `npx prisma db push` -> `npx prisma generate` -> redémarrage du serveur.
  - Supprimer `generated/prisma` + `node_modules/.prisma` seulement si le client est corrompu, puis réinstaller (`npm install`).
- **Seed** : `npm run seed` (ou `ts-node --transpile-only prisma/seed.ts`). Si les comptes seedés manquent, exécuter `./scripts/check-seed.sh`.
- **Docker** : remonter les images (`docker compose down && docker compose up --build`). Si la prod échoue, vérifier les env vars (surtout `DATABASE_URL`, `JWT_SECRET`, `DEPT_HEAD_VALIDATION_DAYS`).
- **Logs & notifications** : Next.js logge les requêtes dans la console. Les retours utilisateurs passent par `react-hot-toast`; réactiver `NODE_ENV=development` si les toasts n’apparaissent plus.

## 10. Déploiements / observabilité
- **Dev** : `docker compose up --build` suffit pour tester l’ensemble (app + Mongo).
- **Staging / prod** :
  - Construire l’image via `docker build --target runner`.
  - Lancer le conteneur avec `--env-file` contenant les mêmes variables que `.env.production`.
  - Appliquer les migrations : `npx prisma db push` ou utiliser un outil Mongo (Atlas pas utilisé ici, on recommande une instance auto-hébergée).
- **Métriques & sécurité** : vérifier les secrets (JWT) et surveiller les comptes seedés (CEO, DSI, Comptable). Limiter l’accès au dashboard CEO.

## 11. Actions recommandées en cas d’absence prolongée
1. Vérifier que les variables `.env` sont sauvegardées dans un vault (JWT + DATABASE_URL).
2. Documenter les comptes seedés et leurs credentials (`SEED_ADMIN_PASSWORD`), puis changer les mots de passe en prod.
3. Décrire tout workflow critique (ex. : validation CEO) avec le diagramme déjà présent dans `README.md`.
4. Noter les prochaines fonctionnalités ou bugs connus dans ce document pour que le suivant ait un point de départ clair.

## 12. Technologies clés et fichiers de référence
| Technologie | Où la retrouver dans le code | Pourquoi elle importe |
| --- | --- | --- |
| **Next.js 16 App Router** | `app/` (pages, layouts, API, hooks) | Routeur serveur, rendu hybride, API centralisées et pages statiques/dynamiques. |
| **React 19 + Hooks** | `app/components/`, `app/dashboard/` | UI déclarative (composants `ContractDocumentsSection`, `EmployeeDocumentsSection`, `OperationsInbox`, `ProfileView`) qui orchestrent `useState`, `useMemo`, `useCallback`. |
| **Prisma 6 + MongoDB** | `prisma/schema.prisma`, `generated/prisma`, `lib/prisma`, `app/api/*` | ORM type-safe pour l’accès Mongo (employés, congés, documents, bulletins). |
| **Tailwind CSS 4** | `app/**/*.tsx`, `app/components/**/*.tsx` | Styles utilitaires, thèmes mobile/desktop, classes dynamiques (boutons, modals). |
| **`next/image`** | `app/login/page.tsx`, `app/register/page.tsx`, `app/onboarding/page.tsx`, `app/not-found.tsx`, `app/page.tsx`, `app/components/ProfileView.tsx` | Optimisation LCP, gestion automatique du redimensionnement. Les blocs `Image` remplacent les `<img>` classiques dans la zone d’authentification. |
| **`@tanstack/react-table`** | `app/dashboard/*/inbox/page.tsx`, `app/dashboard/manager/team/page.tsx`, `app/dashboard/dsi/accounts/pending/page.tsx` | Colonnes configurées via `ColumnDef`, actions (valider/refuser) et décorations par rôle. |
| **`react-hot-toast`** | `app/components/*`, `app/dashboard/*/page.tsx`, `app/register/page.tsx` | Feedback utilisateur pour fetchs API (validation, upload). |

## 13. Cartographie rapide des API consommées par le front
- `app/components/ContractDocumentsSection.tsx` → `GET /api/employees/options`, `GET /api/employee-documents?type=CONTRACT`, `POST /api/employee-documents`, `GET /api/employee-documents/:id/file`. Voir aussi `app/api/leave-requests/route.ts` pour les décisions qui alimentent les blackouts et l’escalade automatique.
- `app/components/EmployeeDocumentsSection.tsx` → `GET /api/employee-documents`, `POST /api/employee-documents`, `PUT /api/employee-documents/:id`, `DELETE /api/employee-documents/:id`, `GET /api/employee-documents/:id/file`, `GET /api/employees/options`.
- `app/components/SalarySlipsAdmin.tsx` → `GET /api/employees/options`, `GET /api/salary-slips`, `POST /api/salary-slips`, `GET /api/salary-slips/:id` pour télécharger les PDF.
- `app/dashboard/operations/inbox/page.tsx` → `GET /api/leave-requests/pending`, `POST /api/leave-requests/:id/approve`, `:reject`, `:escalate` (vers SERVICE_HEAD ou CEO). Les boutons de la grille se calquent sur ces routes.
- `app/dashboard/dsi/accounts/pending/page.tsx` → `PATCH /api/admin/employees/:id/status` (VALIDATE/REJECT) ; `setRoleFor` / `setDeptFor` / `setServiceFor` préparent les payloads.
- `app/api/leave-requests/route.ts` → `POST /api/leave-requests` gère l’auth, le calcul des soldes, la détection de blackouts, et les décisions associées. On l’a commenté pour faciliter la maintenance.

Les commentaires ajoutés dans les views et API vous permettent de savoir rapidement quel endpoint appeler ou modifier. Gardez un oeil sur les hooks (`useMemo`, `useCallback`) pour éviter de casser les dépendances et conservez `next/image` pour optimiser les assets dès qu’un `<img>` est remplacé.
