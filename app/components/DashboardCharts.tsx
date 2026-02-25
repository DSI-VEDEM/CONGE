"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type SeriesPoint = { name: string; value: number };

export default function DashboardCharts({
  title,
  subtitle,
  barData,
  lineData,
  pieData,
}: {
  title: string;
  subtitle: string;
  barData: SeriesPoint[];
  lineData: SeriesPoint[];
  pieData: SeriesPoint[];
}) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const lineColor = "#2f6690";
  const pieColors = ["#f4b942", "#6aa84f", "#e06666", "#8e7cc3", "#76a5af"];
  const barColors = ["#f6b26b", "#93c47d", "#76a5af", "#8e7cc3", "#c27ba0"];

  return (
    <section className="mt-6">
      <div className="mb-4">
        <div className="text-lg font-semibold text-vdm-gold-800">{title}</div>
        {subtitle ? <div className="text-sm text-vdm-gold-700">{subtitle}</div> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="bg-white border border-vdm-gold-200 rounded-xl p-4 h-72">
          <div className="text-sm text-vdm-gold-700 mb-2">Évolution</div>
          {isMounted ? (
            <ResponsiveContainer width="100%" height="85%">
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3e8c8" />
                <XAxis dataKey="name" stroke="#8a6a2f" />
                <YAxis stroke="#8a6a2f" />
                <Tooltip contentStyle={{ borderRadius: 8, borderColor: "#e8d7b0" }} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={lineColor}
                  strokeWidth={3}
                  dot={{ r: 4, fill: lineColor }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : null}
        </div>

        <div className="bg-white border border-vdm-gold-200 rounded-xl p-4 h-72">
          <div className="text-sm text-vdm-gold-700 mb-2">Répartition</div>
          {isMounted ? (
            <ResponsiveContainer width="100%" height="85%">
              <PieChart>
                <Tooltip contentStyle={{ borderRadius: 8, borderColor: "#e8d7b0" }} />
                <Legend />
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={40}
                  outerRadius={75}
                  paddingAngle={2}
                >
                  {pieData.map((_, i) => (
                    <Cell key={`pie-${i}`} fill={pieColors[i % pieColors.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          ) : null}
        </div>

        <div className="bg-white border border-vdm-gold-200 rounded-xl p-4 h-72">
          <div className="text-sm text-vdm-gold-700 mb-2">Volumes</div>
          {isMounted ? (
            <ResponsiveContainer width="100%" height="85%">
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3e8c8" />
                <XAxis dataKey="name" stroke="#8a6a2f" />
                <YAxis stroke="#8a6a2f" />
                <Tooltip contentStyle={{ borderRadius: 8, borderColor: "#e8d7b0" }} />
                <Legend />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {barData.map((_, i) => (
                    <Cell key={`bar-${i}`} fill={barColors[i % barColors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : null}
        </div>
      </div>
    </section>
  );
}
