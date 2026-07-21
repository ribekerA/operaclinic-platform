import { beforeEach, describe, expect, it, vi } from "vitest";
import { TranscriptionProviderFactory } from "../../src/modules/messaging/transcription/transcription-provider.factory";

describe("TranscriptionProviderFactory", () => {
  const configService = {
    get: vi.fn(),
  };

  const mockProvider = {
    transcribe: vi.fn(),
  };

  beforeEach(() => {
    configService.get.mockReset();
    mockProvider.transcribe.mockReset();
  });

  function buildFactory(): TranscriptionProviderFactory {
    return new TranscriptionProviderFactory(configService as never, mockProvider as never);
  }

  it("resolves the mock provider when TRANSCRIPTION_PROVIDER is unset", () => {
    configService.get.mockReturnValue("");

    const factory = buildFactory();

    expect(factory.getProvider()).toBe(mockProvider);
    expect(factory.getProviderName()).toBe("mock");
  });

  it("resolves the mock provider when TRANSCRIPTION_PROVIDER is explicitly 'mock'", () => {
    configService.get.mockReturnValue("mock");

    const factory = buildFactory();

    expect(factory.getProvider()).toBe(mockProvider);
  });

  it("falls back to mock for an unrecognized TRANSCRIPTION_PROVIDER value", () => {
    configService.get.mockReturnValue("elevenlabs");

    const factory = buildFactory();

    expect(factory.getProvider()).toBe(mockProvider);
    expect(factory.getProviderName()).toBe("mock");
  });

  it("throws when TRANSCRIPTION_PROVIDER=whisper is selected, since no real adapter exists yet", () => {
    configService.get.mockReturnValue("whisper");

    const factory = buildFactory();

    expect(() => factory.getProvider()).toThrow(/whisper/);
  });

  it("throws when TRANSCRIPTION_PROVIDER=deepgram is selected, since no real adapter exists yet", () => {
    configService.get.mockReturnValue("deepgram");

    const factory = buildFactory();

    expect(() => factory.getProvider()).toThrow(/deepgram/);
  });

  it("caches the resolved provider instance across repeated getProvider() calls", () => {
    configService.get.mockReturnValue("mock");

    const factory = buildFactory();
    const first = factory.getProvider();
    const second = factory.getProvider();

    expect(first).toBe(second);
    expect(configService.get).toHaveBeenCalledTimes(1);
  });

  it("resetProvider() clears the cache so the next getProvider() call re-resolves", () => {
    configService.get.mockReturnValue("mock");

    const factory = buildFactory();
    factory.getProvider();
    factory.resetProvider();
    factory.getProvider();

    expect(configService.get).toHaveBeenCalledTimes(2);
  });

  it("getProviderName() always reflects the current env value, independent of getProvider() caching", () => {
    configService.get.mockReturnValue("mock");

    const factory = buildFactory();
    factory.getProvider();

    expect(factory.getProviderName()).toBe("mock");
    expect(configService.get).toHaveBeenCalledTimes(2);
  });
});
