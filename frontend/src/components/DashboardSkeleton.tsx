export function DashboardSkeleton() {
  return (
    <div className="dashboard-skeleton" aria-busy="true" aria-label="Loading dashboard data">
      {/* Stats skeleton */}
      <div className="stats-grid">
        {[1, 2, 3].map((i) => (
          <div key={i} className="stat-card skeleton-card">
            <div className="skeleton-icon skeleton-pulse" />
            <div className="skeleton-content">
              <div className="skeleton-line skeleton-line-short skeleton-pulse" />
              <div className="skeleton-line skeleton-line-medium skeleton-pulse" />
              <div className="skeleton-line skeleton-line-tiny skeleton-pulse" />
            </div>
          </div>
        ))}
      </div>

      {/* Energy overview skeleton */}
      <div className="energy-summary-section">
        <div className="skeleton-line skeleton-line-heading skeleton-pulse" />
        <div className="stats-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="stat-card skeleton-card">
              <div className="skeleton-icon skeleton-pulse" />
              <div className="skeleton-content">
                <div className="skeleton-line skeleton-line-short skeleton-pulse" />
                <div className="skeleton-line skeleton-line-medium skeleton-pulse" />
                <div className="skeleton-line skeleton-line-tiny skeleton-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
