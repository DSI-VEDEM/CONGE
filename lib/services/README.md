# lib/services/

Couche métier. Orchestration des règles, validation métier (au-delà de Zod), appels aux `repositories/` et autres services.

Règles :
- Pas de `NextResponse` ici — les services renvoient des données ou lèvent des erreurs typées (`ServiceError`).
- Les `route.ts` traduisent les erreurs métier en réponses HTTP.
- Testable unitairement en mockant les repositories.

Pattern d'erreur :
```ts
export class ServiceError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}
```
