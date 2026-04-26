import { Test, TestingModule } from "@nestjs/testing";
import { SkillExecutorService } from "../services/skill-executor.service";
import { GuardrailvService } from "../services/guardrails.service";
import { SkillRegistryService } from "../../skill-registry/skill-registry.service";
import type { ClinicSkillContext } from "@operaclinic/shared";

describe("SkillExecutorService", () => {
  let service: SkillExecutorService;
  let guardRailsService: GuardrailvService;
  let skillRegistryService: SkillRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillExecutorService,
        GuardrailvService,
        {
          provide: SkillRegistryService,
          useValue: {
            execute: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SkillExecutorService>(SkillExecutorService);
    guardRailsService = module.get<GuardrailvService>(GuardrailvService);
    skillRegistryService = module.get<SkillRegistryService>(
      SkillRegistryService,
    );
  });

  const createValidContext = (): ClinicSkillContext => ({
    tenantId: "tenant-123",
    actorUserId: "user-456",
    threadId: "thread-789",
    correlationId: "corr-001",
    source: "api",
  });

  describe("execute", () => {
    it("should execute skill successfully", async () => {
      const context = createValidContext();
      jest.spyOn(skillRegistryService, "execute").mockResolvedValue({
        success: true,
        data: { id: "patient-123" },
      });

      const result = await service.execute({
        skillName: "find_or_merge_patient",
        payload: { phone: "123456" },
        context,
      });

      expect(result.success).toBe(true);
      expect(result.skillName).toBe("find_or_merge_patient");
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it("should handle skill execution error", async () => {
      const context = createValidContext();
      jest
        .spyOn(skillRegistryService, "execute")
        .mockRejectedValue(new Error("Skill failed"));

      const result = await service.execute({
        skillName: "find_or_merge_patient",
        payload: { phone: "123456" },
        context,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Skill failed");
    });

    it("should validate context before execution", async () => {
      const context = createValidContext();
      context.tenantId = ""; // Invalid context

      const result = await service.execute({
        skillName: "find_or_merge_patient",
        payload: { phone: "123456" },
        context,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Context validation failed");
    });

    it("should validate skill is whitelisted", async () => {
      const context = createValidContext();

      const result = await service.execute({
        skillName: "invalid_skill_name" as any,
        payload: {},
        context,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not allowed");
    });

    it("should track execution time", async () => {
      const context = createValidContext();
      jest.spyOn(skillRegistryService, "execute").mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ success: true }), 50);
          }),
      );

      const result = await service.execute({
        skillName: "find_or_merge_patient",
        payload: { phone: "123456" },
        context,
      });

      expect(result.duration).toBeGreaterThanOrEqual(50);
    });

    it("should include timestamp in result", async () => {
      const context = createValidContext();
      jest
        .spyOn(skillRegistryService, "execute")
        .mockResolvedValue({ success: true });

      const result = await service.execute({
        skillName: "find_or_merge_patient",
        payload: { phone: "123456" },
        context,
      });

      expect(result.timestamp).toBeDefined();
      // Should be ISO string format
      expect(new Date(result.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe("canExecute", () => {
    it("should allow execution of valid skill with valid context", () => {
      const context = createValidContext();

      const result = service.canExecute("find_or_merge_patient", context);

      expect(result.allowed).toBe(true);
      expect(result.reason).toContain("allowed");
    });

    it("should reject execution with invalid context", () => {
      const context = createValidContext();
      context.tenantId = "";

      const result = service.canExecute("find_or_merge_patient", context);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("invalid");
    });

    it("should reject non-whitelisted skill", () => {
      const context = createValidContext();

      const result = service.canExecute("unknown_skill", context);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not allowed");
    });

    it("should provide clear rejection reason", () => {
      const context = createValidContext();
      context.threadId = "";

      const result = service.canExecute("find_or_merge_patient", context);

      expect(result.reason).toBeDefined();
      expect(result.reason.length).toBeGreaterThan(0);
    });
  });

  describe("guardrails integration", () => {
    it("should use guardrails service for context validation", async () => {
      const context = createValidContext();
      const validateSpy = jest.spyOn(guardRailsService, "validateContext");

      jest.spyOn(skillRegistryService, "execute").mockResolvedValue({});

      await service.execute({
        skillName: "find_or_merge_patient",
        payload: {},
        context,
      });

      expect(validateSpy).toHaveBeenCalledWith(context);
    });

    it("should use guardrails service for skill validation", async () => {
      const context = createValidContext();
      const validateSpy = jest.spyOn(guardRailsService, "validateSkillAllowed");

      jest.spyOn(skillRegistryService, "execute").mockResolvedValue({});

      await service.execute({
        skillName: "find_or_merge_patient",
        payload: {},
        context,
      });

      expect(validateSpy).toHaveBeenCalledWith("find_or_merge_patient");
    });
  });

  describe("error handling", () => {
    it("should handle non-Error exceptions", async () => {
      const context = createValidContext();
      jest.spyOn(skillRegistryService, "execute").mockRejectedValue("string error");

      const result = await service.execute({
        skillName: "find_or_merge_patient",
        payload: {},
        context,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("string error");
    });

    it("should still return structured result on error", async () => {
      const context = createValidContext();
      jest
        .spyOn(skillRegistryService, "execute")
        .mockRejectedValue(new Error("Test error"));

      const result = await service.execute({
        skillName: "find_or_merge_patient",
        payload: {},
        context,
      });

      expect(result.skillName).toBe("find_or_merge_patient");
      expect(result.timestamp).toBeDefined();
      expect(result.duration).toBeDefined();
    });
  });

  describe("whitelisted skills", () => {
    const whitelistedSkills = [
      "find_or_merge_patient",
      "search_availability",
      "hold_slot",
      "create_appointment",
      "confirm_appointment",
      "reschedule_appointment",
      "cancel_appointment",
      "open_handoff",
      "close_handoff",
      "send_message",
    ];

    it("should allow all whitelisted skills", () => {
      const context = createValidContext();

      whitelistedSkills.forEach((skill) => {
        const result = service.canExecute(skill, context);
        expect(result.allowed).toBe(true);
      });
    });

    it("should reject non-whitelisted skill", () => {
      const context = createValidContext();

      const result = service.canExecute("hack_the_system", context);

      expect(result.allowed).toBe(false);
    });
  });

  describe("multi-tenant safety", () => {
    it("should accept context with valid tenant ID", async () => {
      const context = createValidContext();
      context.tenantId = "tenant-xyz";

      jest.spyOn(skillRegistryService, "execute").mockResolvedValue({});

      const result = await service.execute({
        skillName: "find_or_merge_patient",
        payload: {},
        context,
      });

      expect(result.success).toBe(true);
    });

    it("should include tenant context in payload for registry", async () => {
      const context = createValidContext();
      const executeSpy = jest.spyOn(skillRegistryService, "execute");

      executeSpy.mockResolvedValue({});

      await service.execute({
        skillName: "find_or_merge_patient",
        payload: { test: "data" },
        context,
      });

      expect(executeSpy).toHaveBeenCalledWith(
        "find_or_merge_patient",
        context,
        { test: "data" },
      );
    });
  });
});
