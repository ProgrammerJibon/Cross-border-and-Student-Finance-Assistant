"use client";
import { LineChart } from "@mui/x-charts/LineChart";
import { BarChart } from "@mui/x-charts/BarChart";
import { PieChart } from "@mui/x-charts/PieChart";
import { Gauge } from "@mui/x-charts/Gauge";
import { useApp } from "@/components/ui/providers";
export function FinanceLine({
  labels,
  series,
}: {
  labels: string[];
  series: { label: string; data: number[]; color?: string }[];
}) {
  const { t } = useApp();
  return (
    <div
      className="chart"
      role="img"
      aria-label={series
        .map((s) => `${t(s.label)}: ${s.data.join(", ")}`)
        .join("; ")}
    >
      <LineChart
        height={270}
        xAxis={[
          {
            scaleType: "point",
            data: labels,
            tickLabelStyle: { fontSize: 11 },
          },
        ]}
        series={series.map((s, i) => ({
          ...s,
          label: t(s.label),
          color: s.color || ["#268a75", "#e3ad73", "#a4b5cd"][i],
          showMark: false,
          curve: "monotoneX",
          area: i === 0,
        }))}
        grid={{ horizontal: true }}
        margin={{ left: 5, right: 15, top: 25, bottom: 5 }}
        slotProps={{ legend: { direction: "horizontal" } }}
      />
    </div>
  );
}
export function FinanceBar({
  labels,
  series,
  currency,
}: {
  currency?: string;
  labels: string[];
  series: { label: string; data: number[]; color?: string }[];
}) {
  const { t, locale } = useApp();
  return (
    <div
      className="chart"
      role="img"
      aria-label={labels
        .map((v, i) => `${t(v)}: ${series.map((s) => s.data[i]).join(", ")}`)
        .join("; ")}
    >
      <BarChart
        height={270}
        xAxis={[
          {
            scaleType: "band",
            data: labels.map(t),
            tickLabelStyle: { fontSize: 10 },
          },
        ]}
        series={series.map((s, i) => ({
          ...s,
          label: t(s.label),
          valueFormatter: currency
            ? (v: number | null) =>
                new Intl.NumberFormat(locale, {
                  style: "currency",
                  currency,
                }).format(v || 0)
            : undefined,
          color: s.color || ["#8dc9b9", "#287b6a"][i],
        }))}
        borderRadius={5}
        grid={{ horizontal: true }}
        margin={{ left: 5, right: 5, top: 20, bottom: 5 }}
      />
    </div>
  );
}
export function FinanceDonut({
  data,
  total,
  label,
}: {
  data: { label: string; value: number }[];
  total: string;
  label: string;
}) {
  const { t } = useApp();
  return (
    <div className="donut-wrap">
      <PieChart
        height={230}
        series={[
          {
            data: data.map((d, i) => ({ id: i, ...d, label: t(d.label) })),
            innerRadius: 73,
            outerRadius: 95,
            paddingAngle: 3,
            cornerRadius: 4,
          },
        ]}
        colors={[
          "#207c68",
          "#8bc8b6",
          "#d1e9df",
          "#e1b57f",
          "#9aacca",
          "#ad9fc5",
          "#d29496",
          "#aebfb5",
        ]}
        hideLegend
      />
      <div className="donut-center">
        <strong>{total}</strong>
        <small>{t(label)}</small>
      </div>
    </div>
  );
}
export function FinanceGauge({ value }: { value: number }) {
  return (
    <Gauge
      width={140}
      height={105}
      value={value}
      startAngle={-100}
      endAngle={100}
      text={({ value }) => `${Math.round(value || 0)}%`}
      sx={{
        "& .MuiGauge-valueArc": { fill: "var(--accent)" },
        "& .MuiGauge-valueText": { fontSize: 25, fontWeight: 600 },
        "& .MuiGauge-referenceArc": { fill: "var(--track)" },
      }}
    />
  );
}
