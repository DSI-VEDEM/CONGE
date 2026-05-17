# Contribuer à Conge

## Workflow git

- `main` : production
- `develop` : intégration (si utilisé)
- `feat/<nom>`, `fix/<nom>`, `refactor/<nom>`, `chore/<nom>` : branches de travail
- Toute modification passe par une **Pull Request** vers `develop` (ou `main`).
- La PR doit voir la CI verte (`lint`, `typecheck`, `test`, `prisma validate`, `build`).

## Conventions de commit

Préfixes recommandés :

- `feat:` nouvelle fonctionnalité
- `fix:` correction de bug
- `refactor:` refonte sans changement de comportement
- `security:` correction de sécurité
- `perf:` amélioration de performance
- `test:` ajout / modification de tests
- `docs:` documentation
- `chore:` configuration, outillage
- `ci:` pipeline CI

Format :

```
<type>: résumé court (~50 caractères)

Description plus détaillée si nécessaire, sur plusieurs lignes.
Pourquoi le changement, pas juste le quoi.
```

## Avant de pousser

```bash
npm run lint
npm run typecheck
npm test
```

(Idéalement automatisés via un hook pre-commit — voir `scripts/install-hooks.sh` si présent.)

## Architecture (rappels rapides)

- Les routes API (`app/api/**/route.ts`) doivent rester courtes : `parse → validate → service → response`.
- La logique métier va dans `lib/services/`.
- L'accès Prisma va dans `lib/repositories/`.
- Validation des inputs : **Zod** uniquement (`lib/schemas/`).
- Pas de `: any` ni `as any` (la règle `@typescript-eslint/no-explicit-any` doit être réactivée à terme).

## Ajouter une route API

1. Créer (ou réutiliser) un schéma Zod dans `lib/schemas/<resource>.schema.ts`.
2. Écrire la logique métier dans `lib/services/<resource>.service.ts` (lance `ServiceError` si besoin).
3. Créer la route :

   ```ts
   export const runtime = "nodejs";
   import { requireRole } from "@/lib/auth";
   import { parseBody } from "@/lib/validate";
   import { mySchema } from "@/lib/schemas/...";
   import * as myService from "@/lib/services/...";
   import { serviceErrorToResponse } from "@/lib/services/service-error";

   export async function POST(req: Request) {
     const v = requireRole(req, ["CEO"]);
     if (!v.ok) return v.error;

     const parsed = await parseBody(req, mySchema);
     if (!parsed.ok) return parsed.error;

     try {
       const result = await myService.doSomething(parsed.data);
       return NextResponse.json({ result }, { status: 201 });
     } catch (e) {
       return serviceErrorToResponse(e);
     }
   }
   ```

4. Ajouter un test dans `tests/services/<resource>.test.ts` (avec mocks de `repositories/`).

## Sécurité

- Ne jamais committer de secret. `.env*` est ignoré (sauf `.env.example`).
- Le `JWT_SECRET` doit être tourné après tout incident ou départ d'un dev avec accès.
- Toute route API doit faire **côté serveur** sa vérification de rôle — les composants `RequireRole`/`RoleGate` côté client sont uniquement UX.

## Tests

- Logique métier pure → tests unitaires Vitest (`tests/lib/*.test.ts`).
- Services → mocker les repositories.
- Routes API → tests d'intégration (à venir).
- E2E → Playwright (à venir).

## Bugs / fonctionnalités

Ouvrir une issue avec :

- Description du comportement attendu vs observé
- Étapes de reproduction
- Capture d'écran ou logs si pertinent
- Environnement (dev / staging / prod)
