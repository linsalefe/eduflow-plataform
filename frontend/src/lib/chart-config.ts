export const chartColors = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
];

export const chartTooltipStyle = {
  contentStyle: {
    backgroundColor: 'white',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    boxShadow: 'var(--shadow-md)',
    fontSize: '13px',
    padding: '8px 12px',
  },
  itemStyle: {
    color: 'var(--foreground)',
    fontSize: '13px',
  },
  labelStyle: {
    color: 'var(--muted-foreground)',
    fontSize: '12px',
    fontWeight: 600,
    marginBottom: '4px',
  },
};

export const chartGridStyle = {
  strokeDasharray: '3 3',
  stroke: 'var(--border)',
  strokeOpacity: 0.6,
};

export const chartAnimationConfig = {
  animationDuration: 800,
  animationEasing: 'ease-out' as const,
};

export function getGradientId(index: number) {
  return `chart-gradient-${index}`;
}