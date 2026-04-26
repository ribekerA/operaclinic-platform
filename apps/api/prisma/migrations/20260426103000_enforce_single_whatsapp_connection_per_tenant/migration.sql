DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "integration_connections"
    GROUP BY "tenant_id", "channel"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one WhatsApp connection per tenant: duplicate integration_connections rows already exist for the same tenant/channel.';
  END IF;
END $$;

CREATE UNIQUE INDEX "uq_integration_connections_tenant_channel"
ON "integration_connections" ("tenant_id", "channel");
