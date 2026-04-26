---
name: Frontend Clinic - UX Fluidity & Data Binding
description: "Regras obrigatórias para web frontend clinic: UX fluidity sem busca manual, data binding seguro, isolamento tenant, responsividade operacional."
paths: ["apps/web/app/clinics/**", "apps/web/components/**", "apps/web/hooks/**", "apps/web/lib/**"]
---

# Frontend Clinic Instructions — UX Fluidity & Data Binding

**Escopo**: [apps/web/app/clinics](apps/web/app/clinics) + reception UI, dashboard  
**Objetivo**: Receptionist e clinic manager não buscam dados; tudo pronto no contexto  
**Crítica**: Atrito UI = no-show, perda de paciente, atraso operacional

---

## 1. Princípios de Fluidez

### 1.1 Context Always Ready

**Quando receptionist abre página**:
- Não há busca manual "procure paciente".
- Dashboard mostra hoje + urgências.
- Click em appointment = tudo contexto pronto.

**Exemplo RUIM**:
```
Página: "Digite o nome do paciente..."
Receptionist digita: "Maria"
Wait 3s...resultado.
Click appointment → Load detalhe...wait 2s.
```

**Exemplo BOM**:
```
Página: "Hoje — 12 appts, 9 confirmados"
Vê appointment → click → side panel abre instantly
Todo contexto: paciente, histórico, ações.
```

### 1.2 Data Binding Seguro

**Toda binding inclui**:
- `tenantId` validado na URL + session.
- Backend responde com `tenantId`; frontend valida match.
- Nenhuma query sem `tenantId`.
- Nenhuma mutação sem `tenantId` + actor em auth header.

### 1.3 Isolamento Tenant

- **URL sempre inclui `clinicId`**: `/clinics/:clinicId/reception/`.
- **Session store inclui `tenantId`**: nunca vir de URL ou localStorage sozinho.
- **Teste E2E**: 2 clínicas no mesmo navegador → zero cross-contamination.

---

## 2. Architecture de Data

### 2.1 Separation of Concerns

```
apps/web/
├── app/
│   ├── clinics/
│   │   ├── [clinicId]/
│   │   │   ├── reception/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx (day view)
│   │   │   │   ├── [appointmentId]/
│   │   │   │   │   └── page.tsx (detail + actions)
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx (overview)
│   ├── patients/ (if needed)
│   └── ...
│
├── components/
│   ├── clinic/
│   │   ├── ReceptionDayView/
│   │   ├── AppointmentDetail/
│   │   ├── ConfirmDialog/
│   │   ├── CheckinForm/
│   │   ├── ReschedulePanel/
│   │   └── ...
│   ├── shared/
│   │   ├── TenantGuard/
│   │   ├── SessionLoader/
│   │   └── ...
│
├── hooks/
│   ├── useClinicContext.ts (clinic + tenant + user)
│   ├── useAppointmentData.ts (fetch + cache)
│   ├── useMutateAppointment.ts (create, update, etc.)
│   └── ...
│
├── lib/
│   ├── api-client.ts (configured with tenantId)
│   ├── validators.ts
│   └── utils.ts
```

### 2.2 Context API (React)

```typescript
// lib/contexts/ClinicContext.tsx
interface ClinicContextType {
  tenantId: string; // ✅ REQUIRED
  clinicId: string;
  user: { id: string; role: string; name: string };
  clinic: { name: string; timezone: string };
}

export const ClinicContext = createContext<ClinicContextType | null>(null);

export function ClinicProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clinicId = searchParams.get("clinicId") || "";

  const [context, setContext] = useState<ClinicContextType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const session = await getSession(); // ✅ includes tenantId
        if (!session || session.clinicId !== clinicId) {
          throw new Error("Unauthorized: clinic mismatch");
        }
        setContext({
          tenantId: session.tenantId,
          clinicId: session.clinicId,
          user: session.user,
          clinic: session.clinic,
        });
      } catch (e) {
        setError(`Failed to load clinic context: ${e.message}`);
        router.push("/login");
      }
    })();
  }, [clinicId, router]);

  if (error) return <ErrorBoundary message={error} />;
  if (!context) return <LoadingSpinner />;

  return (
    <ClinicContext.Provider value={context}>
      {children}
    </ClinicContext.Provider>
  );
}

// ✅ Usage in components
export function useClinicContext() {
  const context = useContext(ClinicContext);
  if (!context) throw new Error("useClinicContext must be within ClinicProvider");
  return context;
}
```

### 2.3 Data Fetching (SWR / React Query)

```typescript
// hooks/useAppointmentData.ts
export function useAppointmentData(appointmentId: string) {
  const { tenantId, clinicId } = useClinicContext();

  const { data, error, isLoading } = useSWR(
    appointmentId
      ? `/api/clinics/${clinicId}/reception/appointments/${appointmentId}?tenantId=${tenantId}`
      : null,
    (url) =>
      fetch(url, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`, // ✅ includes tenantId
        },
      }).then((r) => r.json()),
    { revalidateOnFocus: false }
  );

  return { data, error, isLoading };
}

// ✅ Usage
export function AppointmentDetail({ appointmentId }) {
  const { data: appointment, isLoading, error } = useAppointmentData(appointmentId);

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorMessage message={error} />;
  if (!appointment) return <NotFound />;

  return <AppointmentDetailView appointment={appointment} />;
}
```

---

## 3. Reception Day View

### 3.1 Layout

```tsx
// apps/web/app/clinics/[clinicId]/reception/page.tsx
export default function ReceptionDay() {
  const { clinicId, tenantId } = useClinicContext();
  const { data: dayData, isLoading } = useSWR(
    `/api/clinics/${clinicId}/reception/day?date=${today}&tenantId=${tenantId}`,
    fetcher
  );

  return (
    <div className="flex h-screen gap-4 p-4">
      {/* Urgent Actions */}
      <UrgentActionsWidget actions={dayData?.urgentActions} />

      {/* Day Appointments */}
      <AppointmentList
        appointments={dayData?.appointments}
        onSelect={(apptId) => setSelectedAppointment(apptId)}
      />

      {/* Detail Panel */}
      {selectedAppointment && (
        <AppointmentDetailPanel
          appointmentId={selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
        />
      )}
    </div>
  );
}
```

### 3.2 Quick Actions

```tsx
// components/clinic/ConfirmDialog.tsx
export function ConfirmDialog({ appointmentId, onClose }: Props) {
  const { tenantId } = useClinicContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/clinics/:clinicId/reception/appointments/${appointmentId}/confirm`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getAuthToken()}`, // ✅ header includes tenantId
          },
          body: JSON.stringify({ tenantId }), // ✅ body double-check
        }
      );
      if (!response.ok) {
        throw new Error(`Failed: ${response.statusText}`);
      }
      const result = await response.json();
      toast.success("Confirmado!");
      onClose();
      // Revalidate day view
      mutate(`/api/clinics/:clinicId/reception/day?...`);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <h2>Confirmar Agendamento?</h2>
        <p>Enviará SMS/WhatsApp para o paciente.</p>
        {error && <Alert variant="destructive">{error}</Alert>}
        <DialogFooter>
          <Button onClick={handleConfirm} loading={loading}>
            Enviar Confirmação
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 4. Session & Auth Guard

### 4.1 Middleware (Next.js)

```typescript
// middleware.ts
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protege rotas clinic
  if (pathname.startsWith("/clinics/")) {
    const clinicId = pathname.split("/")[2];
    const session = await getSession(request);

    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    if (session.clinicId !== clinicId) {
      return NextResponse.redirect(new URL("/error?code=403", request.url));
    }

    // ✅ Add tenantId to request headers for downstream use
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("X-Tenant-ID", session.tenantId);
    requestHeaders.set("X-Clinic-ID", clinicId);

    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/clinics/:path*"],
};
```

### 4.2 TenantGuard Component

```tsx
// components/shared/TenantGuard.tsx
export function TenantGuard({
  clinicId,
  children,
}: {
  clinicId: string;
  children: React.ReactNode;
}) {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!session) return;
    if (session.clinicId !== clinicId) {
      router.push("/error?code=403");
    }
  }, [session, clinicId, router]);

  if (!session) return <SessionLoader />;
  if (session.clinicId !== clinicId) return <Unauthorized />;

  return <>{children}</>;
}

// ✅ Usage
export function ClinicPage({ params: { clinicId } }) {
  return (
    <TenantGuard clinicId={clinicId}>
      <ClinicProvider>
        <ReceptionDay />
      </ClinicProvider>
    </TenantGuard>
  );
}
```

---

## 5. Testes Obrigatórios

### 5.1 Unit Tests

- [ ] Component renders without crash.
- [ ] Data binding: correta exibição de appointment data.
- [ ] Tenant isolation: component rejeita clinicId errado.
- [ ] Quick action: confirm button dispara fetch correto.
- [ ] Error handling: erro de backend mostra mensagem.

### 5.2 Integration Tests

- [ ] E2E: login → select clinic → reception day → select appt → confirm → toast sucesso.
- [ ] Isolation: 2 clinics no mesmo navegador → zero cross-contamination.

---

## 6. Performance & Observability

### 6.1 Lazy Loading

```tsx
// Lazy load detail panel apenas quando selecionado
const AppointmentDetail = dynamic(
  () => import("./AppointmentDetail"),
  { loading: () => <Skeleton /> }
);
```

### 6.2 Metrics

| Métrica | Lugar |
|---------|-------|
| `reception.page_load_ms` | Histogram |
| `reception.action_duration_ms` | Histogram (action: confirm, check-in, etc.) |
| `reception.error_rate` | Counter (error_code) |
| `reception.api_call_duration_ms` | Histogram (endpoint) |

---

## 7. Checklist Antes de Merge

- [ ] URL sempre inclui `clinicId`.
- [ ] Context provider valida tenant + clinic match.
- [ ] Data binding não assume clinicId; sempre valida em backend.
- [ ] Nenhuma query sem `tenantId`.
- [ ] Nenhuma mutação sem `tenantId` + actor em auth.
- [ ] Teste E2E: 2 clínicas no mesmo navegador → zero vazamento.
- [ ] Quick actions são < 1s.
- [ ] Erro de backend é mostrado ao usuário, não silenciado.
- [ ] Lazy loading implementado quando apropriado.
- [ ] Documentação atualizada.

---

## 8. Referências Rápidas

| Arquivo | Função |
|---------|--------|
| [apps/web/app/clinics](apps/web/app/clinics) | Clinic pages |
| [apps/web/components/clinic](apps/web/components/clinic) | Clinic components |
| [apps/web/hooks](apps/web/hooks) | Custom hooks |
| [middleware.ts](apps/web/middleware.ts) | Auth guard |

---

**Versão**: 1.0  
**Última atualização**: 2026-04-04  
**Mantido por**: Tech team OperaClinic
