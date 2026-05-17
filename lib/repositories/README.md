# lib/repositories/

Couche d'accès aux données. Chaque fichier expose des fonctions qui parlent à Prisma et **ne contiennent pas** de logique métier.

Règles :
- Chaque fonction prend en argument les paramètres nécessaires (pas de `req`/`session`).
- Renvoie des entités typées via les types Prisma générés.
- Pas de validation Zod ici (faite à l'étage `route.ts` ou `services/`).
- Pas de `NextResponse` ici.

Le but est de pouvoir tester `services/` en mockant `repositories/`.
