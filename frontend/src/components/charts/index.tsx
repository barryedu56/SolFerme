import React from 'react';
import { View } from 'react-native';
import Svg, {
  Rect, Path, Line, Circle, G, Text as SvgText, Defs, LinearGradient, Stop,
} from 'react-native-svg';
import { useChartTheme, niceScale, fmtCompact } from './useChartTheme';

export { ChartCard } from './ChartCard';
export { useChartTheme, fmtCompact } from './useChartTheme';

type Datum = { label: string; value: number };
const PAD = { top: 22, right: 8, bottom: 26, left: 34 };

const gridLines = (top: number, step: number, y: (v: number) => number, x0: number, x1: number, color: string, fmt: (n: number) => string, ink: string) => {
  const rows: React.ReactNode[] = [];
  for (let v = 0; v <= top + 1e-6; v += step) {
    rows.push(<Line key={`g${v}`} x1={x0} y1={y(v)} x2={x1} y2={y(v)} stroke={color} strokeWidth={1} />);
    rows.push(
      <SvgText key={`t${v}`} x={x0 - 6} y={y(v) + 3.5} fontSize={9.5} fill={ink} textAnchor="end" fontWeight="600">
        {fmt(v)}
      </SvgText>,
    );
  }
  return rows;
};

const xLabels = (data: Datum[], x: (i: number) => number, yBase: number, ink: string, w: number) => {
  const maxLabels = Math.max(2, Math.floor((w - PAD.left - PAD.right) / 46));
  const skip = Math.ceil(data.length / maxLabels);
  return data.map((d, i) =>
    i % skip === 0 ? (
      <SvgText key={`x${i}`} x={x(i)} y={yBase + 15} fontSize={9.5} fill={ink} textAnchor="middle" fontWeight="600">
        {d.label}
      </SvgText>
    ) : null,
  );
};

/* ───────────────────────────── BarChart ───────────────────────────── */
export const BarChart: React.FC<{
  width: number; height: number; data: Datum[]; color?: string;
  formatValue?: (n: number) => string; showValues?: boolean;
}> = ({ width, height, data, color, formatValue = fmtCompact, showValues = true }) => {
  const c = useChartTheme();
  const barColor = color ?? c.single;
  if (!data.length || width <= 0) return null;

  const maxV = Math.max(...data.map((d) => d.value), 0);
  const { top, step } = niceScale(maxV || 1);
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const slot = plotW / data.length;
  const bw = Math.min(30, slot * 0.6);
  const x = (i: number) => PAD.left + slot * i + slot / 2;

  return (
    <Svg width={width} height={height}>
      {gridLines(top, step, y, PAD.left, width - PAD.right, c.grid, formatValue, c.inkSoft)}
      {data.map((d, i) => {
        const h = (d.value / top) * plotH;
        return (
          <G key={i}>
            <Rect x={x(i) - bw / 2} y={y(d.value)} width={bw} height={Math.max(h, d.value > 0 ? 2 : 0)} rx={Math.min(5, bw / 2)} fill={barColor} />
            {showValues && d.value > 0 && (
              <SvgText x={x(i)} y={y(d.value) - 6} fontSize={9.5} fill={c.ink} textAnchor="middle" fontWeight="700">
                {formatValue(d.value)}
              </SvgText>
            )}
          </G>
        );
      })}
      {xLabels(data, x, PAD.top + plotH, c.inkSoft, width)}
    </Svg>
  );
};

/* ─────────────────────── GroupedBarChart (2 séries) ─────────────────────── */
export const GroupedBarChart: React.FC<{
  width: number; height: number;
  groups: { label: string; values: [number, number] }[];
  colors: [string, string];
  formatValue?: (n: number) => string;
}> = ({ width, height, groups, colors, formatValue = fmtCompact }) => {
  const c = useChartTheme();
  if (!groups.length || width <= 0) return null;

  const maxV = Math.max(...groups.flatMap((g) => g.values), 0);
  const { top, step } = niceScale(maxV || 1);
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const slot = plotW / groups.length;
  const bw = Math.min(14, slot * 0.28);
  const gx = (i: number) => PAD.left + slot * i + slot / 2;

  return (
    <Svg width={width} height={height}>
      {gridLines(top, step, y, PAD.left, width - PAD.right, c.grid, formatValue, c.inkSoft)}
      {groups.map((g, i) =>
        g.values.map((v, s) => {
          const h = (v / top) * plotH;
          const bx = gx(i) - bw - 2 + s * (bw + 4);
          return (
            <Rect key={`${i}-${s}`} x={bx} y={y(v)} width={bw} height={Math.max(h, v > 0 ? 2 : 0)} rx={Math.min(4, bw / 2)} fill={colors[s]} />
          );
        }),
      )}
      {xLabels(groups as any, gx, PAD.top + plotH, c.inkSoft, width)}
    </Svg>
  );
};

/* ───────────────────────────── LineChart ───────────────────────────── */
export const LineChart: React.FC<{
  width: number; height: number; data: Datum[]; color?: string;
  area?: boolean; formatValue?: (n: number) => string;
}> = ({ width, height, data, color, area = true, formatValue = fmtCompact }) => {
  const c = useChartTheme();
  const lc = color ?? c.single;
  if (data.length < 2 || width <= 0) return null;

  const maxV = Math.max(...data.map((d) => d.value), 0);
  const { top, step } = niceScale(maxV || 1);
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const x = (i: number) => PAD.left + (plotW / (data.length - 1)) * i;

  const pts = data.map((d, i) => [x(i), y(d.value)]);
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
  const areaPath = `${linePath} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const last = data[data.length - 1];

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={lc} stopOpacity={0.22} />
          <Stop offset="1" stopColor={lc} stopOpacity={0.02} />
        </LinearGradient>
      </Defs>
      {gridLines(top, step, y, PAD.left, width - PAD.right, c.grid, formatValue, c.inkSoft)}
      {area && <Path d={areaPath} fill="url(#areaFill)" />}
      <Path d={linePath} stroke={lc} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (i % Math.ceil(data.length / 8) === 0 || i === data.length - 1 ? (
        <Circle key={i} cx={p[0]} cy={p[1]} r={2.6} fill={c.surface} stroke={lc} strokeWidth={1.6} />
      ) : null))}
      <Circle cx={x(data.length - 1)} cy={y(last.value)} r={3.4} fill={lc} />
      <SvgText x={Math.min(x(data.length - 1), width - PAD.right - 2)} y={y(last.value) - 8} fontSize={10} fill={c.ink} textAnchor="end" fontWeight="800">
        {formatValue(last.value)}
      </SvgText>
      {xLabels(data, x, PAD.top + plotH, c.inkSoft, width)}
    </Svg>
  );
};

/* ───────────────────────────── DonutChart ───────────────────────────── */
export const DonutChart: React.FC<{
  size: number;
  data: { label: string; value: number; color: string }[];
  centerLabel?: string; centerValue?: string; thickness?: number;
}> = ({ size, data, centerLabel, centerValue, thickness = 18 }) => {
  const c = useChartTheme();
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${cx}, ${cy}`}>
          <Circle cx={cx} cy={cy} r={r} stroke={c.grid} strokeWidth={thickness} fill="none" />
          {total > 0 &&
            data.map((d, i) => {
              const len = (d.value / total) * circ;
              const el = (
                <Circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r={r}
                  stroke={d.color}
                  strokeWidth={thickness}
                  fill="none"
                  strokeDasharray={`${Math.max(len - 2, 0)} ${circ}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="round"
                />
              );
              offset += len;
              return el;
            })}
        </G>
        {(centerValue || centerLabel) && (
          <>
            <SvgText x={cx} y={cy - 1} fontSize={size * 0.16} fill={c.ink} textAnchor="middle" fontWeight="800">
              {centerValue}
            </SvgText>
            <SvgText x={cx} y={cy + size * 0.13} fontSize={size * 0.075} fill={c.inkSoft} textAnchor="middle" fontWeight="600">
              {centerLabel}
            </SvgText>
          </>
        )}
      </Svg>
    </View>
  );
};
