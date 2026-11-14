import React, { useState } from 'react';

interface TimeSeriesPoint {
  date: string;
  value: number;
}

interface AreaTrendChartProps {
  title: string;
  subtitle?: string;
  data: TimeSeriesPoint[];
  color?: string;
  valueFormatter?: (v: number) => string;
}

export const AreaTrendChart: React.FC<AreaTrendChartProps> = ({
  title,
  subtitle,
  data,
  color = '#2E5BFF',
  valueFormatter = (v) => v.toLocaleString(),
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const gradId = React.useId().replace(/:/g, '');

  const width = 460;
  const height = 160;
  const padX = 12;
  const padY = 16;

  const maxVal = Math.max(1, ...data.map((d) => d.value));
  const totalVal = data.reduce((s, d) => s + d.value, 0);

  const coords = data.map((d, idx) => {
    const x =
      data.length <= 1
        ? width / 2
        : padX + (idx / (data.length - 1)) * (width - padX * 2);
    const y =
      height - padY - (d.value / maxVal) * (height - padY * 2);
    return { x, y, ...d };
  });

  const linePath =
    coords.length > 0
      ? coords.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
      : '';

  const areaPath =
    coords.length > 0
      ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(height - padY).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(height - padY).toFixed(1)} Z`
      : '';

  const hovered = hoveredIdx !== null ? coords[hoveredIdx] : null;

  return (
    <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-sm font-semibold text-[#11162B] dark:text-[#F3F5FA]">{title}</h3>
          {subtitle && (
            <p className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7] mt-0.5">{subtitle}</p>
          )}
        </div>
        <div className="text-right">
          <div className="text-sm font-bold font-mono tabular-nums text-[#11162B] dark:text-[#F3F5FA]">
            {hovered ? valueFormatter(hovered.value) : valueFormatter(totalVal)}
          </div>
          <div className="text-[10px] font-mono tabular-nums text-[#5A6580] dark:text-[#A2ADC7]">
            {hovered ? hovered.date : `Last ${data.length}d total`}
          </div>
        </div>
      </div>

      <div className="relative w-full">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40 overflow-visible">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Subtle horizontal gridlines */}
          {[0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = height - padY - ratio * (height - padY * 2);
            return (
              <line
                key={ratio}
                x1={padX}
                y1={y}
                x2={width - padX}
                y2={y}
                stroke="currentColor"
                className="text-[#E4E7EF] dark:text-[#1E2638]"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
            );
          })}

          {areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke={color}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {hovered && (
            <line
              x1={hovered.x}
              y1={padY}
              x2={hovered.x}
              y2={height - padY}
              stroke={color}
              strokeOpacity="0.35"
              strokeDasharray="3 3"
              strokeWidth="1.5"
            />
          )}

          {coords.map((p, idx) => {
            const sliceW = data.length > 1 ? (width - padX * 2) / (data.length - 1) : width;
            return (
              <g key={p.date}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={hoveredIdx === idx ? 5 : 2.5}
                  fill={hoveredIdx === idx ? '#FFFFFF' : color}
                  stroke={color}
                  strokeWidth={hoveredIdx === idx ? 2.5 : 0}
                />
                <rect
                  x={p.x - sliceW / 2}
                  y={0}
                  width={Math.max(12, sliceW)}
                  height={height}
                  fill="transparent"
                  className="cursor-crosshair"
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
              </g>
            );
          })}
        </svg>

        {data.length > 1 && (
          <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-[#78839E] dark:text-[#7C87A3] px-1">
            <span>{data[0].date.slice(5)}</span>
            <span>{data[Math.floor(data.length / 2)].date.slice(5)}</span>
            <span>{data[data.length - 1].date.slice(5)}</span>
          </div>
        )}
      </div>
    </div>
  );
};

interface DonutDistributionChartProps {
  title: string;
  subtitle?: string;
  items: { label: string; value: number }[];
}

const PALETTE = ['#2E5BFF', '#4D74FF', '#16A34A', '#D97706', '#DC2626', '#0EA5E9'];

export const DonutDistributionChart: React.FC<DonutDistributionChartProps> = ({
  title,
  subtitle,
  items,
}) => {
  const total = items.reduce((s, i) => s + i.value, 0);
  const radius = 50;
  const circumference = 2 * Math.PI * radius;

  let offsetAcc = 0;

  return (
    <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-5 flex flex-col gap-4">
      <div>
        <h3 className="font-display text-sm font-semibold text-[#11162B] dark:text-[#F3F5FA]">{title}</h3>
        {subtitle && (
          <p className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7] mt-0.5">{subtitle}</p>
        )}
      </div>

      {total === 0 ? (
        <div className="h-36 flex items-center justify-center text-xs text-[#5A6580] dark:text-[#A2ADC7]">
          No subscription records yet
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="relative w-32 h-32 shrink-0 flex items-center justify-center">
            <svg viewBox="0 0 130 130" className="w-full h-full -rotate-90">
              <circle
                cx="65"
                cy="65"
                r={radius}
                fill="transparent"
                stroke="currentColor"
                className="text-[#EEF2FF] dark:text-[#1E2638]"
                strokeWidth="16"
              />
              {items.map((item, idx) => {
                const pct = item.value / total;
                const segLen = pct * circumference;
                const dashOffset = -offsetAcc;
                offsetAcc += segLen;
                return (
                  <circle
                    key={item.label}
                    cx="65"
                    cy="65"
                    r={radius}
                    fill="transparent"
                    stroke={PALETTE[idx % PALETTE.length]}
                    strokeWidth="16"
                    strokeDasharray={`${segLen} ${circumference}`}
                    strokeDashoffset={dashOffset}
                  />
                );
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold font-mono tabular-nums text-[#11162B] dark:text-[#F3F5FA]">
                {total}
              </span>
              <span className="text-[10px] text-[#5A6580] dark:text-[#A2ADC7]">Users</span>
            </div>
          </div>

          <div className="flex-1 w-full space-y-2">
            {items.map((item, idx) => {
              const pct = Math.round((item.value / total) * 100);
              return (
                <div key={item.label} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: PALETTE[idx % PALETTE.length] }}
                    />
                    <span className="font-medium text-[#11162B] dark:text-[#F3F5FA] truncate">
                      {item.label}
                    </span>
                  </div>
                  <span className="font-mono tabular-nums text-[#5A6580] dark:text-[#A2ADC7] shrink-0">
                    {item.value} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
