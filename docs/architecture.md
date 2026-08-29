# Utilora Platform Architecture

## Product boundaries

- Free tools are public, anonymous, local-first, and optimized for search acquisition.
- The professional workspace requires authentication and uses server-side entitlements.
- During launch promotion every authenticated user receives pro_trial; payment is not connected.
- Existing static tools remain deployable while modules move into src/.

## Frontend layers

1. src/app: bootstrapping, configuration, and routing.
2. src/core: authentication, Supabase access, organizations, and entitlements.
3. src/modules: finance domains with their own repositories and UI.
4. src/shared: cross-domain types and components.
5. tools: stable public tools retained during migration.

Domain modules must not access browser storage or Supabase directly. They use core services or repositories. Money values are represented as decimal strings at API boundaries and PostgreSQL numeric in storage.

## Access flow

1. Supabase Auth establishes the user session.
2. get_my_effective_entitlement() resolves grants, subscriptions, and promotions.
3. The organization membership determines accessible tenant data.
4. PostgreSQL RLS remains the final authorization boundary.
5. The UI only reflects permission state; it is never the security boundary.

## Migration strategy

The legacy pages remain available while new TypeScript modules replace them incrementally. The Vite build copies legacy routes into dist, so GitHub Pages URLs remain stable. A module is removed from the legacy runtime only after its replacement passes unit and browser tests.