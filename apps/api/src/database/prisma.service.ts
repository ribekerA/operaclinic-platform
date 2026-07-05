import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

// Alpine containers inherit the host's CPU count (e.g. 16) rather than the
// container's allocated vCPUs. Prisma's default pool formula (num_cpus * 2 + 1)
// produces 33 connections on a 16-CPU host. On Render's free-tier PostgreSQL
// this exhausts the connection limit when a rolling deploy runs two containers
// simultaneously. Cap the pool at 5 connections — more than enough for a demo.
const CONNECTION_LIMIT = parseInt(process.env.PRISMA_CONNECTION_LIMIT ?? "5", 10);

function buildDatasourceUrl(base: string | undefined): string {
  const url = base ?? "";
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}connection_limit=${CONNECTION_LIMIT}&pool_timeout=10`;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      datasources: { db: { url: buildDatasourceUrl(process.env.DATABASE_URL) } },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
