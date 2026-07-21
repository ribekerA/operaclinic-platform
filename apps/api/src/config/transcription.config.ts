import { registerAs } from "@nestjs/config";

export default registerAs("transcription", () => ({
  provider: process.env.TRANSCRIPTION_PROVIDER || "",
}));
