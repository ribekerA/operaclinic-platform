"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SessionProfile, SessionUser } from "@/lib/session/types";

interface UseSessionOptions {
  expectedProfile?: SessionProfile;
}

interface UseSessionResult {
  user: SessionUser | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useSession(options: UseSessionOptions = {}): UseSessionResult {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSession = useCallback(async () => {
    setLoading(true);

    try {
      const query = options.expectedProfile
        ? `?profile=${options.expectedProfile}`
        : "";
      const response = await fetch(`/api/session/me${query}`, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        setUser(null);
        setError(null);
        return;
      }

      const payload = (await response.json()) as { user?: SessionUser };
      const nextUser = payload.user ?? null;

      if (options.expectedProfile && nextUser?.profile !== options.expectedProfile) {
        setUser(nextUser);
        setError("PROFILE_MISMATCH");
        return;
      }

      setUser(nextUser);
      setError(null);
    } catch {
      setUser(null);
      setError("Nao foi possivel carregar sessao.");
    } finally {
      setLoading(false);
    }
  }, [options.expectedProfile]);

  useEffect(() => {
    void fetchSession();
  }, [fetchSession]);

  return useMemo(
    () => ({
      user,
      loading,
      error,
      refresh: fetchSession,
    }),
    [user, loading, error, fetchSession],
  );
}
