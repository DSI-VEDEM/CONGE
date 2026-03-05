# Hooks et états : documentation de maintenance

Ce document centralise l'intention derrière les hooks et les états critiques de l'application afin que la maintenance reste simple, même quand de nouveaux formulaires ou flux sont ajoutés.

## 1. Pages client surveillées

### `app/onboarding/page.tsx`
- `useMemo` (ligne ~75) : `initialEmployee` capture une seule fois la session locale via `getEmployee()` pour éviter de relancer l’accès au `localStorage` à chaque rendu.
- `useState` (ligne ~80) : `draft` contient un clone du profil salarié et sert de source unique pour toutes les saisies (photo, coordonnées, CNPS, adresses, etc.).
- `isSaving` et `photoError` (lignes ~91‑94) pilotent l’interface : l’un bloque les boutons pendant la requête, l’autre fait remonter un message utilisateur quand le fichier est invalide.
- `useEffect` (lignes ~101‑145) : session guard + mise à jour à partir de `/api/auth/me`; toute altération de `draft` passe par `setDraft` avec des `prev => ({ ...prev, champ: valeur })` pour éviter de perdre des champs synchronisés.

> À maintenir : toute nouvelle propriété éditable doit s’ajouter à `draft`, bénéficier d’un setter fonctionnel (pour conserver les données antérieures) et passer par les mêmes validations (téléverser photo, téléphone, CNPS, etc.).

### `app/login/page.tsx`
- `useState` (lignes ~18‑22) gère `identifier`, `password`, `showPassword` et `isLoading`. Le `identifier` accepte l’email ou le matricule (`normIdentifier`).
- `useEffect` (lignes ~25‑33) écoute `searchParams` pour afficher les toasts de statut « en attente » / « validé ». Cela évite d’éparpiller la logique dans le JSX et permet de déclencher la notification uniquement quand les query params changent.
- `handleSubmit` et `handleKeyDown` encapsulent la logique de soumission et s’appuient sur `isLoading` pour désactiver les champs.

> À maintenir : restaurez ces guardes de champ dans tout nouveau formulaire de login / validation pour conserver la même expérience (toasts, verrouillage bouton, normalisation du matricule, etc.).

## 2. Hooks partagés

### `app/hooks/useContractDocumentTypes.ts`
- États : `contractDocumentTypes` et `isContractDocumentTypesLoading` (lignes 9‑10) exposent la liste actuelle et l’état de chargement au composant parent.
- `refreshContractDocumentTypes` (lignes 12‑41) est mémorisé via `useCallback`, ce qui évite la recréation de la fonction à chaque rendu et permet de la placer dans la dépendance de `useEffect`.
- `useEffect` (lignes 43‑45) déclenche le fetch initial. Toute erreur remet la liste à vide et notifie via `toast`.

> À maintenir : chaque hook `useXxx` implémenté dans `app/hooks/` doit retourner explicitement les états + loaders + fonctions de rafraîchissement, avec les `useEffect`/`useCallback` nécessaires pour conserver un comportement déterministe.

## 3. Principes généraux de maintenance
- **États locaux, pas globaux** : les pages utilisent `useState` pour encapsuler leurs propres formulaires ; évitez de propager ces états vers le `layout` sauf si c’est absolument partagé.
- **Nommez les setters par action métier** (`setDraft`, `handleSubmit`, `refresh…`). Cela facilite les recherches avec `rg "setDraft"`. Ajoutez un commentaire quand l’état déclenche un effet secondaire (par exemple validations complexes ou uploads). 
- **Gestion d’erreurs cohérente** : couplage `useState` + `toast` (comme `photoError` ou `isLoading`). Un `catch` doit toujours resetter l’état (`setIsSaving(false)`), sinon des interactions peuvent rester bloquées.
- **Derive les valeurs** via `useMemo`/`useCallback` quand la donnée source vient d’un `localStorage` ou d’un `fetch` (cf. `initialEmployee`). Cela évite de recalculer à chaque rendu ou de déclencher des effets additionnels.

## 4. Processus de documentation future
- À chaque nouveau hook/état important, mettez à jour ce fichier en mentionnant le fichier + la plage de lignes (comme `app/onboarding/page.tsx:70-145`).
- Si un état est partagé entre plusieurs composants (ex. un manager qui gère une modal), notez la portée (`local`, `page`, `hook`).
- Décrivez pourquoi la valeur existe, quelles actions la modifient et quels effets secondaires elle tracte (API, validation, navigation). Cela évite d’avoir à relire tout le composant pour comprendre l’état.

Ce référentiel aide à éviter les régressions lorsque les états s’accumulent : gardons-le à jour chaque fois qu’un nouveau formulaire ou hook arrive.
