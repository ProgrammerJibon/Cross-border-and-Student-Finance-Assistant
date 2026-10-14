import "server-only";
import { rows, type DB } from "./db";
import { requireCondition } from "./errors";
export async function catalog() {
  const [currencies, countries] = await Promise.all([
    rows<{ code: string; name: string; symbol: string }>(
      "SELECT code,name,symbol FROM currencies WHERE active=1 ORDER BY FIELD(code,'BDT','CNY') DESC,name",
    ),
    rows<{ code: string; name: string; currency_code: string }>(
      "SELECT code,name,currency_code FROM countries WHERE active=1 ORDER BY FIELD(code,'BD','CN') DESC,name",
    ),
  ]);
  return { currencies, countries };
}
export async function validCurrency(code: string, db?: DB) {
  requireCondition(
    (
      await rows(
        "SELECT code FROM currencies WHERE code=? AND active=1",
        [code],
        db,
      )
    ).length,
    "VALIDATION_ERROR",
  );
}
export async function validCountry(code: string, db?: DB) {
  requireCondition(
    (
      await rows(
        "SELECT code FROM countries WHERE code=? AND active=1",
        [code],
        db,
      )
    ).length,
    "VALIDATION_ERROR",
  );
}
