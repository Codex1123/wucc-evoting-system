import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../config/supabase';
import { clearAuthStorage, getLinkedVoter, getProfile, getStoredVoterSession, hasPersistedAuthMarker, markAuthPersisted, signOut } from '../services/electionService';
import { normalizeRole } from '../services/roles';

const AuthContext = createContext(null);
const AUTH_TIMEOUT_MS = 9000;
const TAB_SESSION_KEY = 'wucc_tab_session_active';
const INACTIVITY_WARNING_MS = 8 * 60 * 1000;
const INACTIVITY_LOGOUT_MS = 10 * 60 * 1000;
const BALLOT_POSTPONE_MS = 30 * 1000;
const PROTECTED_PATH_PREFIXES = ['/dashboard', '/vote', '/admin', '/history'];

function isBallotSubmitting() {
  return Boolean(window.__WUCC_BALLOT_SUBMITTING);
}

function isProtectedPath(pathname) {
  return PROTECTED_PATH_PREFIXES.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function withTimeout(promise, message = 'Authentication check timed out.') {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), AUTH_TIMEOUT_MS);
    })
  ]);
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [voter, setVoter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionWarning, setSessionWarning] = useState(false);
  const refreshId = useRef(0);
  const warningTimer = useRef(null);
  const logoutTimer = useRef(null);

  const hardLogout = useCallback(async () => {
    setSessionWarning(false);
    setSession(null);
    setProfile(null);
    setVoter(null);
    try {
      clearAuthStorage();
      if (supabase) await supabase.auth.signOut();
    } catch (err) {
      console.error('[auth] automatic logout failed', err);
    } finally {
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }
  }, []);

  const resetInactivityTimers = useCallback(() => {
    window.clearTimeout(warningTimer.current);
    window.clearTimeout(logoutTimer.current);
    setSessionWarning(false);
    if (!profile) return;

    warningTimer.current = window.setTimeout(() => {
      if (isBallotSubmitting()) {
        resetInactivityTimers();
        return;
      }
      setSessionWarning(true);
    }, INACTIVITY_WARNING_MS);

    logoutTimer.current = window.setTimeout(() => {
      if (isBallotSubmitting()) {
        logoutTimer.current = window.setTimeout(() => {
          if (!isBallotSubmitting()) hardLogout();
          else resetInactivityTimers();
        }, BALLOT_POSTPONE_MS);
        return;
      }
      hardLogout();
    }, INACTIVITY_LOGOUT_MS);
  }, [hardLogout, profile]);

  const refreshAuth = useCallback(async ({ showLoading = false } = {}) => {
    const currentRefresh = ++refreshId.current;
    if (!supabase) {
      setLoading(false);
      return;
    }
    if (showLoading) setLoading(true);
    try {
      const { data, error } = await withTimeout(supabase.auth.getSession());
      if (error) throw error;
      if (currentRefresh !== refreshId.current) return;
      setSession(data.session);
      if (data.session?.user) {
        await withTimeout(hydrateUser(data.session.user), 'Account loading timed out.');
        markAuthPersisted();
        sessionStorage.setItem(TAB_SESSION_KEY, 'true');
      } else {
        const storedVoter = getStoredVoterSession();
        setProfile(storedVoter ? { ...storedVoter.profile, role: normalizeRole(storedVoter.profile.role) } : null);
        setVoter(storedVoter?.voter || null);
        if (storedVoter) {
          markAuthPersisted();
          sessionStorage.setItem(TAB_SESSION_KEY, 'true');
        }
      }
    } catch (err) {
      console.error('[auth] session refresh failed', err);
      if (currentRefresh === refreshId.current) {
        setSession(null);
        setProfile(null);
        setVoter(null);
      }
    } finally {
      if (currentRefresh === refreshId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasPersistedAuthMarker() && !sessionStorage.getItem(TAB_SESSION_KEY)) {
      clearAuthStorage();
      setLoading(false);
      if (isProtectedPath(window.location.pathname)) window.location.assign('/login');
      return undefined;
    }
    sessionStorage.setItem(TAB_SESSION_KEY, 'true');
    refreshAuth({ showLoading: true });
    const { data: sub } = supabase?.auth.onAuthStateChange(async (_event, nextSession) => {
      try {
        setLoading(true);
        setSession(nextSession);
        if (nextSession?.user) await withTimeout(hydrateUser(nextSession.user), 'Account loading timed out.');
        else {
          const storedVoter = getStoredVoterSession();
          setProfile(storedVoter ? { ...storedVoter.profile, role: normalizeRole(storedVoter.profile.role) } : null);
          setVoter(storedVoter?.voter || null);
        }
        if (nextSession?.user || getStoredVoterSession()) {
          markAuthPersisted();
          sessionStorage.setItem(TAB_SESSION_KEY, 'true');
        }
      } catch (err) {
        console.error('[auth] auth state hydration failed', err);
        setProfile(null);
        setVoter(null);
      } finally {
        setLoading(false);
      }
    }) || { data: null };
    return () => {
      sub?.subscription?.unsubscribe();
    };
  }, [refreshAuth]);

  useEffect(() => {
    if (!profile) {
      window.clearTimeout(warningTimer.current);
      window.clearTimeout(logoutTimer.current);
      setSessionWarning(false);
      return undefined;
    }

    const activityEvents = ['mousemove', 'keydown', 'scroll', 'click'];
    const onActivity = () => {
      if (isBallotSubmitting()) return;
      resetInactivityTimers();
    };
    activityEvents.forEach((eventName) => window.addEventListener(eventName, onActivity, { passive: true }));
    resetInactivityTimers();
    return () => {
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, onActivity));
      window.clearTimeout(warningTimer.current);
      window.clearTimeout(logoutTimer.current);
    };
  }, [profile, resetInactivityTimers]);

  useEffect(() => {
    function refreshWhenActive() {
      if (document.visibilityState === 'visible') refreshAuth();
    }
    document.addEventListener('visibilitychange', refreshWhenActive);
    window.addEventListener('focus', refreshWhenActive);
    return () => {
      document.removeEventListener('visibilitychange', refreshWhenActive);
      window.removeEventListener('focus', refreshWhenActive);
    };
  }, [refreshAuth]);

  useEffect(() => {
    if (!loading) return undefined;
    const id = window.setTimeout(() => setLoading(false), AUTH_TIMEOUT_MS + 2000);
    return () => window.clearTimeout(id);
  }, [loading]);

  async function hydrateUser(user) {
    try {
      const [nextProfile, nextVoter] = await Promise.all([getProfile(user).catch(() => null), getLinkedVoter(user).catch(() => null)]);
      setProfile(nextProfile ? { ...nextProfile, role: normalizeRole(nextProfile.role) } : null);
      setVoter(nextVoter);
    } catch (err) {
      console.error('[auth] hydrate user failed', err);
      setProfile(null);
      setVoter(null);
    }
  }

  const value = useMemo(() => ({
    session,
    user: session?.user || null,
    profile,
    voter,
    loading,
    setProfile,
    setVoter,
    logout: async () => {
      await signOut();
      setSession(null);
      setProfile(null);
      setVoter(null);
      if (window.location.pathname !== '/login') window.location.assign('/login');
    }
  }), [session, profile, voter, loading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      {sessionWarning && profile && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-lg font-black tracking-tight">Session expiring soon</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Session expiring soon due to inactivity.</p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secondary" onClick={hardLogout}>Logout</button>
              <button type="button" className="btn-primary" onClick={resetInactivityTimers}>Stay Logged In</button>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
