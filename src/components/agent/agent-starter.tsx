"use client";
import { useState } from "react";
import { FiArrowUpRight, FiBookOpen, FiPieChart, FiSend } from "react-icons/fi";
import { useApp } from "@/components/ui/providers";

export function AgentStarter({
  onDraft,
  disabled,
}: {
  onDraft: (prompt: string) => void;
  disabled: boolean;
}) {
  const { t, catalog } = useApp();
  const [intent, setIntent] = useState("tuition");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [details, setDetails] = useState("");
  return (
    <div className="agent-starter">
      <div className="agent-intents" aria-label={t("agentIntent")}>
        {[
          ["tuition", <FiBookOpen key="tuition" />],
          ["budget", <FiPieChart key="budget" />],
          ["transfer", <FiSend key="transfer" />],
        ].map(([key, icon]) => (
          <button
            type="button"
            key={String(key)}
            aria-pressed={intent === key}
            disabled={disabled}
            onClick={() => setIntent(String(key))}
          >
            {icon}
            <span>{t(String(key))}</span>
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onDraft(
            `${t(`agentDraft_${intent}`).replace("{amount}", amount).replace("{currency}", currency)}${details.trim() ? `\n${t("agentDetails")}: ${details.trim()}` : ""}`,
          );
        }}
      >
        <div className="agent-starter-fields">
          <label>
            {t("amount")}
            <input
              type="number"
              min="0.01"
              max="100000000"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={disabled}
            />
          </label>
          <label>
            {t("currency")}
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              disabled={disabled}
            >
              {catalog.currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          {t("agentDetails")}
          <input
            value={details}
            maxLength={500}
            placeholder={t("agentDetailsPlaceholder")}
            onChange={(e) => setDetails(e.target.value)}
            disabled={disabled}
          />
        </label>
        <button type="submit" className="button secondary" disabled={disabled}>
          {t("preparePrompt")}
          <FiArrowUpRight />
        </button>
      </form>
      <small>{t("promptDraftNote")}</small>
    </div>
  );
}
