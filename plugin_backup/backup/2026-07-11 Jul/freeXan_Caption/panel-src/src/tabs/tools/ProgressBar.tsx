/**
 * freeXan Caption — Progress Bar
 * Shared component for indicating long-running tasks.
 */
import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './ProgressBar.css';

export interface ProgressBarRef {
  start: (label?: string) => void;
  stop: (success: boolean, finalLabel?: string) => void;
}

export const ProgressBar = forwardRef<ProgressBarRef>((_, ref) => {
  const [isActive, setIsActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState('');
  const [status, setStatus] = useState<'running' | 'success' | 'error'>('running');

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isActive && status === 'running') {
      interval = setInterval(() => {
        setProgress((p) => Math.min(p + 3, 95));
      }, 80);
    }
    return () => clearInterval(interval);
  }, [isActive, status]);

  useImperativeHandle(ref, () => ({
    start: (initialLabel = 'Processing...') => {
      setIsActive(true);
      setStatus('running');
      setProgress(0);
      setLabel(initialLabel);
    },
    stop: (success: boolean, finalLabel?: string) => {
      setStatus(success ? 'success' : 'error');
      setProgress(100);
      setLabel(finalLabel || (success ? 'Complete!' : 'Failed'));
      
      // Auto-hide after 2 seconds
      setTimeout(() => {
        setIsActive(false);
        setTimeout(() => {
          setProgress(0);
          setStatus('running');
          setLabel('');
        }, 300); // Wait for fade out
      }, 2000);
    }
  }));

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          className="fx-progress-container"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
        >
          <div className="fx-progress-track">
            <motion.div
              className={`fx-progress-fill fx-progress-fill--${status}`}
              animate={{ width: `${progress}%` }}
              transition={{ ease: 'linear', duration: 0.1 }}
            />
          </div>
          <div className="fx-progress-label">{label}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

ProgressBar.displayName = 'ProgressBar';
