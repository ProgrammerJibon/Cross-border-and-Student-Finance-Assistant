import { D, money } from "@/lib/money";
import { rows, type DB } from "@/lib/db";
import { getRates } from "./currency.service";
export type Provider = {
  id: string;
  name: string;
  base_fee: string;
  percentage_fee: string;
  spread: string;
  minimum: string;
  maximum: string;
  eta_days: number;
  reliability: number;
};
export function calculateQuote(
  provider: Provider,
  receive: string,
  sourceRate: string,
  targetRate: string,
) {
  const rate = D(targetRate).div(sourceRate).mul(D(1).minus(provider.spread));
  const source = D(receive).div(rate).toDecimalPlaces(2);
  const fee = source.mul(provider.percentage_fee).plus(provider.base_fee);
  return {
    provider_id: provider.id,
    provider: provider.name,
    receive_amount: money(receive),
    source_amount: money(source),
    fee: money(fee),
    total: money(source.plus(fee)),
    rate: rate.toFixed(8),
    eta_days: provider.eta_days,
    reliability: provider.reliability,
  };
}
export async function compareQuotes(
  receive: string,
  source: string,
  target: string,
  db?: DB,
) {
  const rates = await getRates(db);
  if (!rates[source] || !rates[target] || source === target)
    throw new Error("Unsupported currency corridor");
  const providers = await rows<Provider>(
    "SELECT p.* FROM remittance_providers p JOIN remittance_corridors c ON c.provider_id=p.id WHERE p.active=1 AND c.source_currency=? AND c.target_currency=?",
    [source, target],
    db,
  );
  return providers
    .filter(
      (p) =>
        D(receive).div(rates[target]).gte(p.minimum) &&
        D(receive).div(rates[target]).lte(p.maximum),
    )
    .map((p) => ({
      ...calculateQuote(
        {
          ...p,
          base_fee: money(D(p.base_fee).div(rates.BDT).mul(rates[source])),
        },
        receive,
        rates[source],
        rates[target],
      ),
      source_currency: source,
      target_currency: target,
    }))
    .sort((a, b) => D(a.total).cmp(b.total));
}
