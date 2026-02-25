# Documentation technique

- **Objectif** : la stack est packagée via un `Dockerfile` multi‑étapes (`base → deps → dev → builder → runner`). Le stage `deps` installe à présent `openssl` avant `npm ci` pour que Prisma et les bindings SWC voient la bonne version de libssl dans l’image Debian (`Dockerfile:1-11`).
- **Dépendances natives** : Next.js 16.1.4 requiert le binaire `@next/swc-linux-x64-gnu`. Pour éviter les erreurs sur macOS/Windows, ce paquet reste dans `optionalDependencies` et est reflété dans `package-lock.json` (`package.json:31-47`, `package-lock.json:24-45`), ce qui garantit qu’il n’est résolu que dans les environnements Linux (comme la CI ou Docker).
- **Workflow Compose** : `docker-compose.yml` cible la phase `dev`, expose le port 3000 et monte les dossiers source + `.next`/`node_modules` afin de pouvoir itérer (hot reload) dans un conteneur tout en partageant un `.env` au service (`docker-compose.yml:1-15`).
- **Vérifications** :
  1. `docker compose up --build` reconstruit l’image et active `prisma generate` après l’installation des dépendances (logs complets dans le terminal).
  2. Le port 3000 était occupé par `next-server (v16.1.4)` sur l’hôte, ce qui a provoqué un échec de binding pour Compose.
  3. `docker run --rm -p 3001:3000 conge-app` prouve que le conteneur démarre sans problème dès que le port mappé est libre.
- **Recommandations** :
  1. Libérer `:3000` sur l’hôte ou changer la mappage avant de relancer `docker compose up --build`.
  2. Garder `@next/swc-linux-x64-gnu` dans `optionalDependencies` pour garantir la cohérence Linux/Docker.
  3. Suivre les logs Prisma/Next lors de chaque build pour s’assurer qu’OpenSSL et Turbopack détectent bien les binaires natifs.
  4. Pour Docker + Compass (Mongo local), démarre `mongod` via `--replSet rs0`, valide `rs.initiate()` et expose l’URL `mongodb://host.docker.internal:27017/conge?replicaSet=rs0` dans un fichier `.env` utilisé par Compose afin que le conteneur puisse exécuter les transactions (la base peut ensuite être préparée manuellement, sans script `seed`).

- Les sous-directeurs sont automatiquement rattachés aux services Information, Réputation et Qualité de la Direction des Opérations, via le seed, ce qui reflète la structure attendue en production.
