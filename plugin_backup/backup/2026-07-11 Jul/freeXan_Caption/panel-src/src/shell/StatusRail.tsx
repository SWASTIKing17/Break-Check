/**
 * freeXan Caption — StatusRail
 *
 * 4px vertical strip on the left edge showing live Premiere connection state.
 * Green = connected, Amber = project open but no sequence, Red = disconnected.
 * Click to expand the SessionInspector drawer.
 */
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSessionStore, type ConnectionState } from '@/store/sessionStore';
import { usePrefsStore } from '@/store/prefsStore';
import { SessionInspector } from './SessionInspector';
import './StatusRail.css';

const RAIL_GRADIENTS: Record<ConnectionState, string> = {
  connected: 'linear-gradient(180deg, #10b981 0%, #10b981 60%, rgba(16,185,129,0.3) 100%)',
  'project-open': 'linear-gradient(180deg, #f59e0b 0%, #f59e0b 40%, rgba(245,158,11,0.2) 100%)',
  disconnected: 'linear-gradient(180deg, #ef4444 0%, #ef4444 30%, rgba(239,68,68,0.15) 100%)',
};

export const StatusRail: React.FC = () => {
  const connection = useSessionStore((s) => s.connection);
  const inspectorOpen = usePrefsStore((s) => s.inspectorOpen);
  const toggleInspector = usePrefsStore((s) => s.toggleInspector);

  return (
    <>
      <div
        className="fx-status-rail"
        style={{ background: RAIL_GRADIENTS[connection] }}
        onClick={toggleInspector}
        title="Click to toggle session inspector"
      />

      <AnimatePresence>
        {inspectorOpen && (
          <motion.div
            className="fx-inspector-drawer"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 'var(--fx-rail-w-open)', opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <SessionInspector />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
