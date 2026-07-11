/**
 * freeXan Caption — Edit Dashboard
 * Fallback empty state when no timeline is found.
 */
import React from 'react';

interface EmptyDashboardProps {
  onRefresh: () => void;
}

export const EmptyDashboard: React.FC<EmptyDashboardProps> = ({ onRefresh }) => (
  <div className="cc-empty-dashboard">
    <div className="cc-empty-art">
      <div className="cc-empty-icon">📂</div>
      <div className="cc-empty-ring"></div>
    </div>
    <h3>No Phrases Detected</h3>
    <p>Drop a freeXan Caption MOGRT onto the timeline and click refresh to start editing.</p>
    <button className="fx-btn fx-btn--primary" onClick={onRefresh} style={{ marginTop: '12px' }}>
      <i className="fas fa-sync" /> Refresh Timeline
    </button>
  </div>
);
