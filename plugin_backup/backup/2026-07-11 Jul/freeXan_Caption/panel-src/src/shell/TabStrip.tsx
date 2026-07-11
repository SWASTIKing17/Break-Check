/**
 * freeXan Caption — TabStrip
 *
 * Horizontal tab navigation with 4 pill labels and a Framer Motion
 * shared-layout underline that slides between active tabs.
 */
import React from 'react';
import { motion } from 'framer-motion';
import { usePrefsStore, type TabId } from '@/store/prefsStore';
import './TabStrip.css';

interface TabDef {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: TabDef[] = [
  { id: 'workflow', label: 'Workflow', icon: 'fas fa-stream' },
  { id: 'edit',     label: 'Edit',     icon: 'fas fa-pen' },
  { id: 'params',   label: 'Params',   icon: 'fas fa-sliders-h' },
  { id: 'tools',    label: 'Tools',    icon: 'fas fa-wrench' },
];

export const TabStrip: React.FC = () => {
  const activeTab = usePrefsStore((s) => s.activeTab);
  const setActiveTab = usePrefsStore((s) => s.setActiveTab);

  return (
    <nav className="fx-tabstrip no-select">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          className={`fx-tab ${activeTab === tab.id ? 'fx-tab--active' : ''}`}
          onClick={() => setActiveTab(tab.id)}
        >
          <i className={tab.icon} />
          <span>{tab.label}</span>

          {/* Animated underline indicator */}
          {activeTab === tab.id && (
            <motion.div
              className="fx-tab__indicator"
              layoutId="tab-indicator"
              transition={{
                type: 'spring',
                stiffness: 500,
                damping: 35,
              }}
            />
          )}
        </button>
      ))}
    </nav>
  );
};
