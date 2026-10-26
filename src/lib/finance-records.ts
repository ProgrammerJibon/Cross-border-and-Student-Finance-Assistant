export const financeRecordsSource = `(
  SELECT
    id,
    user_id,
    account_id,
    amount,
    currency,
    type,
    category,
    description,
    notes,
    date,
    confidence,
    created_at,
    'LEDGER' AS record_source
  FROM transactions
  UNION ALL
  SELECT
    id,
    user_id,
    account_id,
    amount,
    currency,
    type,
    category,
    description,
    notes,
    date,
    confidence,
    created_at,
    'BUDGET' AS record_source
  FROM budget_records
) AS finance_rows`;
