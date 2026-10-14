export default function Loading() {
  return (
    <div className="loading-page" aria-busy="true">
      <div className="skeleton skeleton-title" />
      <div className="metrics-grid">
        {[0, 1, 2, 3].map((i) => (
          <div className="skeleton skeleton-card" key={i} />
        ))}
      </div>
      <div className="skeleton skeleton-chart" />
    </div>
  );
}
