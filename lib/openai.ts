import OpenAI from "openai";

export const storePilotModel = process.env.OPENAI_MODEL ?? "gpt-5.6";

let client: OpenAI | null = null;

export function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required to call OpenAI from StorePilot.");
  }

  client ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  return client;
}
