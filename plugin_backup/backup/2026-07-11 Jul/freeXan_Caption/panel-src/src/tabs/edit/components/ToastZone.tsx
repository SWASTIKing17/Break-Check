/**
 * freeXan Caption — ToastZone
 * Renders ephemeral status notifications for the Edit tab.
 */
import React from 'react';
import { useEditStore } from '@/store/editStore';
import { motion, AnimatePresence } from 'framer-motion';

export const ToastZone: React.FC = () => {
  const toasts = useEditStore((s) => s.toasts);

  return (
    <div className="cc-toast-zone">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div 
            key={t.id} 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`cc-toast cc-toast-${t.kind || 'info'}`}
          >
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
