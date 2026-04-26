import { Injectable, Logger } from "@nestjs/common";
import type { AgentIntentType, IntentClassification, ClinicSkillName } from "../types/agent-runtime.types";

/**
 * Intent Router
 * Classifies conversation messages into agent intents
 * Determines routing and applicable skills
 *
 * Uses keyword-based classification (simple heuristic)
 * Future: can be upgraded to ML-based classification
 */
@Injectable()
export class IntentRouterService {
  private readonly logger = new Logger(IntentRouterService.name);

  private readonly intentPatterns: Record<
    AgentIntentType,
    {
      keywords: string[];
      suggestedSkills: ClinicSkillName[];
      requiresEscalation: boolean;
    }
  > = {
    FAQ_SIMPLE: {
      keywords: [
        "horário",
        "funcionamento",
        "endereço",
        "telefone",
        "valor",
        "preço",
        "informação",
        "como",
        "quanto",
      ],
      suggestedSkills: ["send_message"],
      requiresEscalation: false,
    },
    LEAD_CAPTURE: {
      keywords: ["interessado", "informações", "conhecer", "interessante", "saiba mais"],
      suggestedSkills: ["find_or_merge_patient", "send_message"],
      requiresEscalation: false,
    },
    BOOK_APPOINTMENT: {
      keywords: [
        "agendar",
        "marcar",
        "agendamento",
        "horário",
        "quando",
        "dia",
        "nova consulta",
        "primeira consulta",
      ],
      suggestedSkills: [
        "find_or_merge_patient",
        "search_availability",
        "hold_slot",
        "create_appointment",
      ],
      requiresEscalation: false,
    },
    RESCHEDULE_APPOINTMENT: {
      keywords: [
        "remarcar",
        "mudar",
        "trocar",
        "passagem",
        "adiar",
        "avançar",
        "novo horário",
        "outra data",
        "consulta",
      ],
      suggestedSkills: [
        "search_availability",
        "reschedule_appointment",
      ],
      requiresEscalation: false,
    },
    CANCEL_APPOINTMENT: {
      keywords: ["cancelar", "desmarcar", "não vou", "não posso", "cancela"],
      suggestedSkills: ["cancel_appointment"],
      requiresEscalation: false,
    },
    HUMAN_REQUEST: {
      keywords: [
        "falar com",
        "atendente",
        "humano",
        "pessoa",
        "recepção",
        "suporte",
        "ajuda",
        "urgente",
      ],
      suggestedSkills: ["open_handoff"],
      requiresEscalation: true,
    },
    SELECT_OPTION: {
      keywords: ["primeiro", "segundo", "terceiro", "opção", "o 1", "o 2", "o 3", "quero o", "marcar o"],
      suggestedSkills: ["hold_slot", "create_appointment"],
      requiresEscalation: false,
    },
    OUT_OF_SCOPE: {
      keywords: [],
      suggestedSkills: [],
      requiresEscalation: true,
    },
  };

  /**
   * Classify message intent
   */
  classify(messageText: string): IntentClassification {
    this.logger.debug(`Classifying intent for message: "${messageText.substring(0, 50)}..."`);

    const normalizedText = messageText.toLowerCase().trim();
    
    // Check for direct numeric selection (1, 2, 3...)
    const numericMatch = normalizedText.match(/^([1-9]|10)$/);
    if (numericMatch) {
      return {
        intent: "SELECT_OPTION",
        confidence: 0.99,
        keywords: [numericMatch[0]],
        suggestedSkills: this.intentPatterns.SELECT_OPTION.suggestedSkills,
        requiresEscalation: false,
        reason: "Direct numeric selection detected",
      };
    }

    const matchedIntents: Array<{
      intent: AgentIntentType;
      score: number;
      matchCount: number;
      matchedKeywords: string[];
    }> = [];

    // Score each intent based on keyword matches
    // Prioritize by: (1) absolute match count, (2) match percentage
    for (const [intent, config] of Object.entries(this.intentPatterns)) {
      if (config.keywords.length === 0) {
        // OUT_OF_SCOPE is fallback
        continue;
      }

      const matchedKeywords = config.keywords.filter((kw) =>
        normalizedText.includes(kw),
      );

      if (matchedKeywords.length > 0) {
        const matchCount = matchedKeywords.length;
        const percentage = matchCount / config.keywords.length;
        // Score by absolute match count first, then by percentage (tiebreaker)
        const score = matchCount + percentage;

        matchedIntents.push({
          intent: intent as AgentIntentType,
          score,
          matchCount,
          matchedKeywords,
        });
      }
    }

    // Pick best match
    let result: IntentClassification;

    if (matchedIntents.length > 0) {
      matchedIntents.sort((a, b) => {
        // Sort by match count (descending), then by score
        if (a.matchCount !== b.matchCount) {
          return b.matchCount - a.matchCount;
        }
        return b.score - a.score;
      });

      const best = matchedIntents[0];
      const config = this.intentPatterns[best.intent];
      const confidence = Math.min(best.matchCount / config.keywords.length, 0.95);

      result = {
        intent: best.intent,
        confidence,
        keywords: best.matchedKeywords,
        suggestedSkills: config.suggestedSkills,
        requiresEscalation: config.requiresEscalation,
        reason: `Matched keywords: ${best.matchedKeywords.join(", ")}`,
      };
    } else {
      // No matches = out of scope - confidence should be low since we don't recognize it
      result = {
        intent: "OUT_OF_SCOPE",
        confidence: 0.1, // Lower than any partial match (even 1/6 keywords = 0.1666)
        keywords: [],
        suggestedSkills: this.intentPatterns.OUT_OF_SCOPE.suggestedSkills,
        requiresEscalation: true,
        reason: "No recognized keywords matched",
      };
    }

    this.logger.debug(
      `Intent classified: ${result.intent} (confidence: ${result.confidence})`,
    );

    return result;
  }

  /**
   * Get all possible intents (for documentation/debugging)
   */
  listIntents(): Array<{ intent: AgentIntentType; description: string }> {
    return [
      { intent: "FAQ_SIMPLE", description: "Simple frequently asked questions" },
      { intent: "LEAD_CAPTURE", description: "New lead / patient inquiry" },
      {
        intent: "BOOK_APPOINTMENT",
        description: "Patient wants to schedule appointment",
      },
      {
        intent: "RESCHEDULE_APPOINTMENT",
        description: "Patient wants to change appointment",
      },
      {
        intent: "CANCEL_APPOINTMENT",
        description: "Patient wants to cancel appointment",
      },
      { intent: "HUMAN_REQUEST", description: "Explicitly asks for human" },
      { intent: "OUT_OF_SCOPE", description: "Message out of agent scope" },
    ];
  }
}
