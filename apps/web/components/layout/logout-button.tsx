"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SessionProfile } from "@/lib/session/types";

interface LogoutButtonProps {
  profile: SessionProfile;
}

export function LogoutButton({ profile }: LogoutButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogout(): Promise<void> {
    setIsLoading(true);

    try {
      await fetch(`/api/session/logout?profile=${profile}`, {
        method: "POST",
      });
    } finally {
      const loginPath = profile === "platform" ? "/login/platform" : "/login/clinic";
      router.replace(loginPath);
      router.refresh();
      setIsLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => {
        void handleLogout();
      }}
      className="inline-flex items-center rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink transition hover:bg-accentSoft"
      disabled={isLoading}
    >
      {isLoading ? "Saindo..." : "Sair"}
    </button>
  );
}
