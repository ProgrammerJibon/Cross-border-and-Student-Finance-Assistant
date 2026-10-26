for both local and production, fix this error:
```Server operation failed Error
 GET /en/dashboard 200 in 496ms (next.js: 4ms, application-code: 493ms)
syncAutomaticAlerts error: Error: Table 'jibonco1_finbridge_ai.finance_records' doesn't exist
    at rows (src\lib\db.ts:44:39)
    at conditions (src\services\automatic-alerts.service.ts:69:30)
    at async (src\services\automatic-alerts.service.ts:178:21)
    at async atomic (src\lib\db.ts:57:20)
    at async syncAutomaticAlerts (src\services\automatic-alerts.service.ts:166:3)
    at async (src\actions\dashboard.actions.ts:35:7)
    at async action (src\lib\errors.ts:10:35)
    at async Page (src\app\[locale]\[[...path]]\page.tsx:126:18)
  42 |   db?: DB,
  43 | ): Promise<T[]> {
> 44 |   const [result] = await (db || pool).execute<RowDataPacket[]>(sql, values);
     |                                       ^
  45 |   return result as T[];
  46 | }
  47 | export async function write(sql: string, values: SqlValue[] = [], db?: DB) { {
  code: 'ER_NO_SUCH_TABLE',
  errno: 1146,
  sqlState: '42S02',
  sqlMessage: "Table 'jibonco1_finbridge_ai.finance_records' doesn't exist",
  sql: "SELECT category,currency,SUM(amount) amount FROM finance_records WHERE user_id=? AND type='EXPENSE' AND date>=DATE_FORMAT(UTC_DATE(),'%Y-%m-01') AND date<=LAST_DAY(UTC_DATE()) GROUP BY category,currency"
}``` we don't want any view to be created.



in production live, when i click add money and then review, it says "The operation could not be completed. Please try again.", but its working in localhost.