"use client";
import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
export function RevenueChart({
  data,
}: {
  data: { day: string; revenue: number; outflow: number }[];
}) {
  return (
    <div
      className="chart"
      role="img"
      aria-label="Comparación de ingresos y salidas por día; el libro detallado se encuentra debajo"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="day" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Bar
            isAnimationActive={false}
            name="Entradas USD"
            dataKey="revenue"
            fill="#166546"
            radius={[3, 3, 0, 0]}
          />
          <Bar
            isAnimationActive={false}
            name="Salidas USD"
            dataKey="outflow"
            fill="#b17436"
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
