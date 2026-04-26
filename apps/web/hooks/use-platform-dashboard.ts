"use client";

import { useCallback, useEffect, useState } from "react";
import type { PlatformDashboardResponsePayload } from "@operaclinic/shared";
import { toErrorMessage } from "@/lib/client/http";
import { getPlatformDashboard } from "@/lib/client/platform-identity-api";

export function usePlatformDashboard(autoLoad = true) {
  const [dashboard, setDashboard] =
    useState<PlatformDashboardResponsePayload | null>(null);
  const [isLoading, setIsLoading] = useState(autoLoad);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const payload = await getPlatformDashboard();
      setDashboard(payload);
    } catch (requestError) {
      setError(
        toErrorMessage(
          requestError,
          "Nao foi possivel carregar a leitura unificada da torre de controle.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!autoLoad) {
      return;
    }

    void reload();
  }, [autoLoad, reload]);

  return {
    dashboard,
    isLoading,
    error,
    reload,
  };
}
