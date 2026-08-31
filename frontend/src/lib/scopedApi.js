import React, { createContext, useContext } from 'react';
import { api } from '@/lib/axios';

/**
 * Scoped API base for reused Dispatch page components.
 *
 * The admin Dispatch pages call `/dispatch/...`. When those same components are
 * rendered inside the Client Portal we wrap them in <ScopeProvider base="/portal/dispatch">
 * so every `/dispatch/...` call is transparently rewritten to `/portal/dispatch/...`
 * (the strictly client-scoped endpoints). Admin usage has no provider, so the
 * default base is `/dispatch` and behaviour is completely unchanged.
 */
const ScopeContext = createContext('/dispatch');

function makeScoped(base) {
  if (!base || base === '/dispatch') return api;
  const portalRoot = base.replace(/\/dispatch$/, ''); // e.g. '/portal'
  const rewrite = (url) => {
    if (typeof url !== 'string') return url;
    if (url.startsWith('/dispatch')) return base + url.slice('/dispatch'.length);
    // Payment (SO) lives at its own top-level admin router; scope it under the
    // same portal root so the reused PaymentSOPage hits /portal/so-payments/*.
    if (url.startsWith('/so-payments')) return portalRoot + url;
    return url;
  };
  const wrap = (method) => (url, ...rest) => api[method](rewrite(url), ...rest);
  return {
    get: wrap('get'),
    post: wrap('post'),
    put: wrap('put'),
    delete: wrap('delete'),
    patch: wrap('patch'),
  };
}

export const ScopeProvider = ({ base, children }) => (
  <ScopeContext.Provider value={base}>{children}</ScopeContext.Provider>
);

export const useScopedApi = () => {
  const base = useContext(ScopeContext);
  return React.useMemo(() => makeScoped(base), [base]);
};

/** Raw scope base string ('/dispatch' for admin, '/portal/dispatch' in the
 * Client Portal). Use for building non-axios URLs like window.open() targets. */
export const useScopeBase = () => useContext(ScopeContext);
