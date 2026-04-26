import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { ConversationContextResolverService } from "../../src/modules/agent/services/conversation-context-resolver.service";
import type { ConversationContext } from "../../src/modules/agent/types/agent-runtime.types";
import type { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import type { ClinicSkillContext } from "@operaclinic/shared";

describe("ConversationContextResolverService", () => {
  let service: ConversationContextResolverService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ConversationContextResolverService],
    }).compile();

    service = module.get<ConversationContextResolverService>(
      ConversationContextResolverService,
    );
  });

  describe("resolveFromSkillContext", () => {
    it("should resolve valid skill context to conversation context", () => {
      const skillContext: ClinicSkillContext = {
        tenantId: "tenant-123",
        actorUserId: "user-456",
        threadId: "thread-789",
        correlationId: "corr-001",
        source: "api",
      };

      const result = service.resolveFromSkillContext(
        skillContext,
        "thread-789",
      );

      expect(result.tenantId).toBe("tenant-123");
      expect(result.threadId).toBe("thread-789");
      expect(result.actorUserId).toBe("user-456");
      expect(result.channel).toBe("WHATSAPP");
      expect(result.source).toBe("AGENT");
    });

    it("should throw if tenantId is missing", () => {
      const skillContext = {
        tenantId: "",
        actorUserId: "user-456",
        source: "api",
      } as ClinicSkillContext;

      expect(() =>
        service.resolveFromSkillContext(skillContext, "thread-789"),
      ).toThrow(BadRequestException);
    });

    it("should throw if actorUserId is missing", () => {
      const skillContext: ClinicSkillContext = {
        tenantId: "tenant-123",
        actorUserId: "",
        threadId: "thread-789",
        source: "api",
      };

      expect(() =>
        service.resolveFromSkillContext(skillContext, "thread-789"),
      ).toThrow(BadRequestException);
    });

    it("should throw if threadId is missing", () => {
      const skillContext: ClinicSkillContext = {
        tenantId: "tenant-123",
        actorUserId: "user-456",
        threadId: "thread-789",
        source: "api",
      };

      expect(() => service.resolveFromSkillContext(skillContext, "")).toThrow(
        BadRequestException,
      );
    });
  });

  describe("resolveFromWebhook", () => {
    it("should resolve webhook payload with proper tenant isolation check", () => {
      const actor: AuthenticatedUser = {
        id: "user-123",
        email: "test@example.com",
        roles: ["AGENT"],
        tenantIds: ["tenant-abc"],
      } as AuthenticatedUser;

      const result = service.resolveFromWebhook(actor, {
        tenantId: "tenant-abc",
        threadId: "thread-xyz",
        channel: "WHATSAPP",
      });

      expect(result.tenantId).toBe("tenant-abc");
      expect(result.threadId).toBe("thread-xyz");
      expect(result.channel).toBe("WHATSAPP");
      expect(result.actorUserId).toBe("user-123");
      expect(result.source).toBe("MESSAGE");
    });

    it("should CRITICAL: reject when user does not belong to tenant", () => {
      const actor: AuthenticatedUser = {
        id: "user-123",
        email: "test@example.com",
        roles: ["AGENT"],
        tenantIds: ["tenant-xyz"], // Different tenant
      } as AuthenticatedUser;

      expect(() =>
        service.resolveFromWebhook(actor, {
          tenantId: "tenant-abc", // Different
          threadId: "thread-123",
          channel: "WHATSAPP",
        }),
      ).toThrow(BadRequestException);
    });

    it("should include patient ID if provided", () => {
      const actor: AuthenticatedUser = {
        id: "user-123",
        email: "test@example.com",
        roles: ["AGENT"],
        tenantIds: ["tenant-abc"],
      } as AuthenticatedUser;

      const result = service.resolveFromWebhook(actor, {
        tenantId: "tenant-abc",
        threadId: "thread-xyz",
        channel: "WHATSAPP",
        patientId: "patient-456",
      });

      expect(result.patientId).toBe("patient-456");
    });

    it("should include metadata if provided", () => {
      const actor: AuthenticatedUser = {
        id: "user-123",
        email: "test@example.com",
        roles: ["AGENT"],
        tenantIds: ["tenant-abc"],
      } as AuthenticatedUser;

      const result = service.resolveFromWebhook(actor, {
        tenantId: "tenant-abc",
        threadId: "thread-xyz",
        channel: "WHATSAPP",
        metadata: { source: "whatsapp_api" },
      });

      expect(result.metadata?.source).toBe("whatsapp_api");
    });
  });

  describe("validate", () => {
    it("should validate complete context", () => {
      const context: ConversationContext = {
        tenantId: "tenant-123",
        threadId: "thread-456",
        channel: "WHATSAPP",
        correlationId: "corr-789",
        actorUserId: "user-abc",
        actorRole: "AGENT",
        source: "AGENT",
        timestamp: new Date(),
      };

      const result = service.validate(context);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should return errors for invalid channel", () => {
      const context: ConversationContext = {
        tenantId: "tenant-123",
        threadId: "thread-456",
        channel: "INVALID" as "WHATSAPP",
        correlationId: "corr-789",
        actorUserId: "user-abc",
        actorRole: "AGENT",
        source: "AGENT",
        timestamp: new Date(),
      };

      const result = service.validate(context);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should return errors for invalid actor role", () => {
      const context: ConversationContext = {
        tenantId: "tenant-123",
        threadId: "thread-456",
        channel: "WHATSAPP",
        correlationId: "corr-789",
        actorUserId: "user-abc",
        actorRole: "INVALID_ROLE",
        source: "AGENT",
        timestamp: new Date(),
      };

      const result = service.validate(context);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("actor role"))).toBe(true);
    });

    it("should return errors for missing tenantId", () => {
      const context: ConversationContext = {
        tenantId: "",
        threadId: "thread-456",
        channel: "WHATSAPP",
        correlationId: "corr-789",
        actorUserId: "user-abc",
        actorRole: "AGENT",
        source: "AGENT",
        timestamp: new Date(),
      };

      const result = service.validate(context);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("tenantId"))).toBe(true);
    });
  });

  describe("resolveClinicId", () => {
    it("should extract clinic ID from metadata", () => {
      const context: ConversationContext = {
        tenantId: "tenant-123",
        threadId: "thread-456",
        channel: "WHATSAPP",
        correlationId: "corr-789",
        actorUserId: "user-abc",
        actorRole: "AGENT",
        source: "AGENT",
        timestamp: new Date(),
        metadata: { clinicId: "clinic-xyz" },
      };

      const result = service.resolveClinicId(context);

      expect(result).toBe("clinic-xyz");
    });

    it("should return undefined if clinic ID not in metadata", () => {
      const context: ConversationContext = {
        tenantId: "tenant-123",
        threadId: "thread-456",
        channel: "WHATSAPP",
        correlationId: "corr-789",
        actorUserId: "user-abc",
        actorRole: "AGENT",
        source: "AGENT",
        timestamp: new Date(),
      };

      const result = service.resolveClinicId(context);

      expect(result).toBeUndefined();
    });
  });
});
