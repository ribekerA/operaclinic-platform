import { beforeEach, describe, expect, it, vi } from "vitest";
import { SkillRegistryService } from "../../src/modules/skill-registry/skill-registry.service";

describe("SkillRegistryService", () => {
  const actorResolver = {
    resolve: vi.fn(),
  };

  const patientSkills = {
    findOrMergePatient: vi.fn(),
  };

  const schedulingSkills = {
    searchAvailability: vi.fn(),
    holdSlot: vi.fn(),
    createAppointment: vi.fn(),
    confirmAppointment: vi.fn(),
    rescheduleAppointment: vi.fn(),
    cancelAppointment: vi.fn(),
  };

  const messagingSkills = {
    openHandoff: vi.fn(),
    closeHandoff: vi.fn(),
    sendMessage: vi.fn(),
  };

  beforeEach(() => {
    actorResolver.resolve.mockReset();
    patientSkills.findOrMergePatient.mockReset();
    schedulingSkills.searchAvailability.mockReset();
    schedulingSkills.holdSlot.mockReset();
    schedulingSkills.createAppointment.mockReset();
    schedulingSkills.confirmAppointment.mockReset();
    schedulingSkills.rescheduleAppointment.mockReset();
    schedulingSkills.cancelAppointment.mockReset();
    messagingSkills.openHandoff.mockReset();
    messagingSkills.closeHandoff.mockReset();
    messagingSkills.sendMessage.mockReset();
  });

  it("lists the minimum clinic skills expected for the future agent layer", () => {
    const registry = new SkillRegistryService(
      actorResolver as never,
      patientSkills as never,
      schedulingSkills as never,
      messagingSkills as never,
    );

    expect(registry.listSkills().map((skill) => skill.name)).toEqual([
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
    ]);
  });

  it("dispatches patient skills through the registry with resolved actor context", async () => {
    const actor = {
      id: "user-1",
      email: "recepcao@tenant.local",
      profile: "clinic",
      roles: ["RECEPTION"],
      tenantIds: ["tenant-1"],
      activeTenantId: "tenant-1",
    };

    actorResolver.resolve.mockResolvedValue(actor);
    patientSkills.findOrMergePatient.mockResolvedValue({
      id: "patient-1",
    });

    const registry = new SkillRegistryService(
      actorResolver as never,
      patientSkills as never,
      schedulingSkills as never,
      messagingSkills as never,
    );

    const result = await registry.execute(
      "find_or_merge_patient",
      {
        tenantId: "tenant-1",
        actorUserId: "user-1",
        source: "MESSAGING",
        threadId: "thread-1",
      },
      {
        fullName: "Cliente Aurora",
        contacts: [
          {
            type: "WHATSAPP",
            value: "(11) 98888-0000",
            isPrimary: true,
          },
        ],
      },
    );

    expect(actorResolver.resolve).toHaveBeenCalledOnce();
    expect(patientSkills.findOrMergePatient).toHaveBeenCalledWith(actor, {
      fullName: "Cliente Aurora",
      contacts: [
        {
          type: "WHATSAPP",
          value: "(11) 98888-0000",
          isPrimary: true,
        },
      ],
    });
    expect(result).toEqual({
      id: "patient-1",
    });
  });

  it("dispatches messaging skills through the registry without leaking provider rules", async () => {
    const actor = {
      id: "user-2",
      email: "gestor@tenant.local",
      profile: "clinic",
      roles: ["CLINIC_MANAGER"],
      tenantIds: ["tenant-1"],
      activeTenantId: "tenant-1",
    };

    actorResolver.resolve.mockResolvedValue(actor);
    messagingSkills.sendMessage.mockResolvedValue({
      id: "thread-1",
      status: "IN_HANDOFF",
    });

    const registry = new SkillRegistryService(
      actorResolver as never,
      patientSkills as never,
      schedulingSkills as never,
      messagingSkills as never,
    );

    const result = await registry.execute(
      "send_message",
      {
        tenantId: "tenant-1",
        actorUserId: "user-2",
        source: "MESSAGING",
        threadId: "thread-1",
      },
      {
        threadId: "thread-1",
        text: "Oi, vamos seguir com a recepcao por aqui.",
      },
    );

    expect(messagingSkills.sendMessage).toHaveBeenCalledWith(
      actor,
      {
        tenantId: "tenant-1",
        actorUserId: "user-2",
        source: "MESSAGING",
        threadId: "thread-1",
      },
      {
        threadId: "thread-1",
        text: "Oi, vamos seguir com a recepcao por aqui.",
      },
    );
    expect(result).toEqual({
      id: "thread-1",
      status: "IN_HANDOFF",
    });
  });
});
