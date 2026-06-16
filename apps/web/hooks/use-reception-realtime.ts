import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";

/**
 * Connects to the reception WebSocket namespace and calls onUpdate whenever
 * any appointment changes status in the current tenant. The callback is stable
 * (stored in a ref) so callers can pass an inline function without extra deps.
 */
export function useReceptionRealtime(
  tenantId: string | null | undefined,
  onUpdate: () => void,
): void {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!tenantId) return;

    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

    const socket: Socket = io(`${apiUrl}/reception`, {
      withCredentials: true,
      query: { tenantId },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socket.on("appointment_updated", () => {
      onUpdateRef.current();
    });

    socket.on("connect_error", (err: Error) => {
      console.warn("[ReceptionRealtime] connection error:", err.message);
    });

    return () => {
      socket.disconnect();
    };
  }, [tenantId]);
}
