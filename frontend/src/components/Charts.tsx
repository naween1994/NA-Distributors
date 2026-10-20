import { ChartNoAxesCombined, ArrowUpRight } from 'lucide-react';
import { money, displayDate } from '../api';
export function SalesChart({ data }: { data: { week: string; revenue: number }[] }) {
  if (!data.length)
    return (
      <div className="chart-empty">
        <div className="chart-grid" />
        <div className="chart-empty-content">
          <span className="chart-empty-icon">
            <ChartNoAxesCombined size={25} />
          </span>
          <strong>Your sales story starts here</strong>
          <p>Create your first order to see weekly revenue.</p>
        </div>
        <div className="chart-axis">
          <span>MON</span>
          <span>TUE</span>
          <span>WED</span>
          <span>THU</span>
          <span>FRI</span>
          <span>SAT</span>
          <span>SUN</span>
        </div>
      </div>
    );
  const max = Math.max(...data.map((d) => d.revenue), 1);
  return (
    <div className="sales-chart">
      <div className="chart-y-axis">
        {[1, 0.75, 0.5, 0.25, 0].map((n) => (
          <span key={n}>
            {max * n >= 1000 ? ((max * n) / 1000).toFixed(0) + 'k' : Math.round(max * n)}
          </span>
        ))}
      </div>
      <div className="chart-bars">
        {data.map((d) => (
          <div className="chart-bar-column" key={d.week}>
            <div className="chart-bar-track">
              <div
                className="chart-bar"
                style={{ height: Math.max(1, (d.revenue / max) * 100) + '%' }}
                tabIndex={0}
                aria-label={`${displayDate(d.week)}: ${money(d.revenue)}`}
              >
                <span className="chart-tooltip">{money(d.revenue)}</span>
              </div>
            </div>
            <span>{displayDate(d.week).slice(0, 6)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
export function ProgressBar({
  value,
  max,
  color = 'green',
}: {
  value: number;
  max: number;
  color?: string;
}) {
  return (
    <div className={'progress-track ' + color}>
      <span style={{ width: Math.min(100, max ? (value / max) * 100 : 0) + '%' }} />
    </div>
  );
}
