import "server-only";
import { effectiveSubscription } from "@/lib/entitlements";
import { rows } from "@/lib/db";
import { requireCondition, AppError } from "@/lib/errors";
import { decryptSecret } from "@/lib/secrets";
import type { ProviderCompany } from "./provider-config";
export async function resolveModel(userId: string, id?: string | null) {
  if (!id || id === "mock") return null;
  const [subscription] = await effectiveSubscription(userId);
  if (subscription?.plan_id === "student-free") {
    const [owned] = await rows("SELECT id FROM ai_models WHERE id=? AND owner_id=?", [id,userId]);
    requireCondition(owned, "SHARED_AI_REQUIRES_PRO");
  }
  let model:
    | {
        id: string;
        company: ProviderCompany;
        model: string;
        key_cipher: string;
        base_url: string | null;
        input_price: string | null;
        output_price: string | null;
      }
    | undefined;
  try {
    const list = await rows<{
      id: string;
      company: ProviderCompany;
      model: string;
      key_cipher: string;
      base_url: string | null;
      input_price: string | null;
      output_price: string | null;
    }>(
      "SELECT id,company,model,key_cipher,base_url,input_price,output_price FROM ai_models WHERE id=? AND active=1 AND (owner_id=? OR owner_id IS NULL)",
      [id, userId],
    );
    model = list[0];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("base_url")) {
      const list = await rows<{
        id: string;
        company: ProviderCompany;
        model: string;
        key_cipher: string;
        base_url: string | null;
        input_price: string | null;
        output_price: string | null;
      }>(
        "SELECT id,company,model,key_cipher,NULL AS base_url,NULL AS input_price,NULL AS output_price FROM ai_models WHERE id=? AND active=1 AND (owner_id=? OR owner_id IS NULL)",
        [id, userId],
      );
      model = list[0];
    } else {
      throw err;
    }
  }
  requireCondition(model, "NOT_FOUND");
  try {
    return {
      company: model.company,
      model: model.model,
      key: decryptSecret(model.key_cipher),
      base_url: model.base_url,
      input_price: model.input_price,
      output_price: model.output_price,
    };
  } catch {
    throw new AppError("AI_UNAVAILABLE");
  }
}
