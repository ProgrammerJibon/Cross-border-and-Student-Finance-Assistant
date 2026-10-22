// Additive and repeatable; existing model IDs, encrypted keys and history survive.
export async function migrateAgent(db) {
  const [company] = await db.execute(
    "SELECT COLUMN_TYPE kind FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ai_models' AND COLUMN_NAME='company'",
  );
  if (!company[0]?.kind.includes("ANTHROPIC"))
    await db.execute(
      "ALTER TABLE ai_models MODIFY company ENUM('OPENAI','GEMINI','ANTHROPIC','COMPATIBLE') NOT NULL",
    );
  for (const [name, definition] of Object.entries({
    base_url: "VARCHAR(300) NULL",
    input_price: "DECIMAL(16,6) NULL",
    output_price: "DECIMAL(16,6) NULL",
  })) {
    const [columns] = await db.execute(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ai_models' AND COLUMN_NAME=?",
      [name],
    );
    if (!columns.length)
      await db.execute(
        `ALTER TABLE ai_models ADD COLUMN ${name} ${definition}`,
      );
  }
  await db.execute(`CREATE TABLE IF NOT EXISTS agent_provider_usage (
    id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL, run_id VARCHAR(64) NULL,
    model_id VARCHAR(64) NULL, provider VARCHAR(20) NOT NULL, model VARCHAR(100) NOT NULL,
    http_status INT NOT NULL, input_tokens BIGINT NULL, output_tokens BIGINT NULL, total_tokens BIGINT NULL,
    estimated_cost_usd DECIMAL(20,8) NULL, details JSON NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(run_id) REFERENCES agent_runs(id), INDEX(user_id,created_at)
  )`);
  const [content] = await db.execute(
    "SELECT DATA_TYPE kind FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='agent_messages' AND COLUMN_NAME='content'",
  );
  if (content[0]?.kind === "text")
    await db.execute(
      "ALTER TABLE agent_messages MODIFY content MEDIUMTEXT NOT NULL",
    );
}
