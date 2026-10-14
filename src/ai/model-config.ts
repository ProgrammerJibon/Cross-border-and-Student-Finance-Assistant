import "server-only";
import { rows } from "@/lib/db";
import { requireCondition, AppError } from "@/lib/errors";
import { decryptSecret } from "@/lib/secrets";
export async function resolveModel(userId: string, id?: string | null) {
  if (!id || id === "mock") return null;
  const [model] = await rows<{
    id: string;
    company: "OPENAI" | "GEMINI";
    model: string;
    key_cipher: string;
  }>(
    "SELECT id,company,model,key_cipher FROM ai_models WHERE id=? AND active=1 AND (owner_id=? OR owner_id IS NULL)",
    [id, userId],
  );
  requireCondition(model, "NOT_FOUND");
  try {
    return {
      company: model.company,
      model: model.model,
      key: decryptSecret(model.key_cipher),
    };
  } catch {
    throw new AppError("AI_UNAVAILABLE");
  }
}
