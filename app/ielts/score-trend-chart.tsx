"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type ScoreRow = {
  date: string;
  L?: number;
  R?: number;
  W?: number;
  S?: number;
};

type Props = {
  data: ScoreRow[];
  listening: string;
  reading: string;
  writing: string;
  speaking: string;
};

export function ScoreTrendChart({ data, listening, reading, writing, speaking }: Props) {
  const chart = data.map((row) => ({
    name: row.date.length > 5 ? row.date.slice(5) : row.date,
    L: row.L,
    R: row.R,
    W: row.W,
    S: row.S,
  }));

  if (chart.length === 0) {
    return (
      <div
        className="ielts-card-static"
        style={{
          minHeight: 220,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderStyle: "dashed",
          opacity: 0.85,
        }}
      >
        <p className="ielts-text-caption" style={{ textAlign: "center", maxWidth: 260 }}>
          完成 Mock Test 並儲存分數後，將在此顯示 L / R / W / S 趨勢
        </p>
      </div>
    );
  }

  return (
    <div className="ielts-card-static" style={{ padding: "16px 12px 8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <span className="ielts-text-heading" style={{ fontSize: 16 }}>
          分數趨勢
        </span>
        <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 11, color: "var(--ielts-text-3)" }}>
          <span>
            <span style={{ color: listening }}>●</span> 聽
          </span>
          <span>
            <span style={{ color: reading }}>●</span> 閱
          </span>
          <span>
            <span style={{ color: writing }}>●</span> 寫
          </span>
          <span>
            <span style={{ color: speaking }}>●</span> 說
          </span>
          <span style={{ borderBottom: "1px dashed var(--ielts-pomodoro)" }}>目標 6.5</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chart} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--ielts-border-light)" />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--ielts-text-3)" }} axisLine={{ stroke: "var(--ielts-border-medium)" }} />
          <YAxis domain={[4, 8]} ticks={[4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8]} tick={{ fontSize: 10, fill: "var(--ielts-text-3)" }} width={32} />
          <Tooltip
            contentStyle={{
              background: "var(--ielts-bg-surface)",
              border: "1px solid var(--ielts-border-light)",
              borderRadius: 10,
              fontSize: 12,
            }}
          />
          <ReferenceLine y={6.5} stroke="var(--ielts-pomodoro)" strokeDasharray="4 4" />
          <Line type="monotone" dataKey="L" stroke={listening} strokeWidth={2} dot={{ r: 3 }} connectNulls />
          <Line type="monotone" dataKey="R" stroke={reading} strokeWidth={2} dot={{ r: 3 }} connectNulls />
          <Line type="monotone" dataKey="W" stroke={writing} strokeWidth={2} dot={{ r: 3 }} connectNulls />
          <Line type="monotone" dataKey="S" stroke={speaking} strokeWidth={2} dot={{ r: 3 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
