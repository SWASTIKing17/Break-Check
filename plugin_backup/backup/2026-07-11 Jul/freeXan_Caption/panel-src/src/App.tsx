/**
 * freeXan Caption — Root Application Component
 *
 * M2: Full shell with AppBar, StatusRail, TabStrip, and routed tab content.
 * Initializes the Premiere state polling hook.
 *
 * FIX (blank-tab): All four tab views are permanently mounted in the DOM.
 * Only the active one is visible (display: block). This prevents cold-boot
 * failures that left inactive tabs blank after switching.
 * Each tab is wrapped in an ErrorBoundary so a single tab crash never
 * propagates to the rest of the UI.
 */
import React from 'react';
import { LayoutGroup } from 'framer-motion';
import { AppBar } from '@/shell/AppBar';
import { StatusRail } from '@/shell/StatusRail';
import { TabStrip } from '@/shell/TabStrip';
import { ErrorBoundary } from '@/shell/ErrorBoundary';
import { usePremiereState } from '@/hooks/usePremiereState';
import { useFreeXanWs } from '@/hooks/useFreeXanWs';
import { usePrefsStore, type TabId } from '@/store/prefsStore';

// Tab views — all imported at module level so they are never GC'd
import { WorkflowView } from '@/tabs/workflow/WorkflowView';
import { EditView } from '@/tabs/edit/EditView';
import { ParamsView } from '@/tabs/params/ParamsView';
import { ToolsView } from '@/tabs/tools/ToolsView';

const ALL_TABS: { id: TabId; Component: React.FC }[] = [
  { id: 'workflow', Component: WorkflowView },
  { id: 'edit',     Component: EditView     },
  { id: 'params',   Component: ParamsView   },
  { id: 'tools',    Component: ToolsView    },
];

export const App: React.FC = () => {
  // Start polling Premiere state
  usePremiereState();

  // Start freeXan WebSocket and BloomX event listeners globally
  useFreeXanWs();

  const activeTab = usePrefsStore((s) => s.activeTab);

  return (
    <LayoutGroup>
      {/* Status Rail — left edge */}
      <StatusRail />

      {/* Main content column */}
      <div className="fx-main">
        {/* App Bar */}
        <AppBar />

        {/* Tab Strip */}
        <TabStrip />

        {/* Tab content — all tabs stay mounted; only the active one is shown */}
        <div className="fx-tab-content">
          {ALL_TABS.map(({ id, Component }) => (
            <div
              key={id}
              style={{
                display: id === activeTab ? 'block' : 'none',
                height: '100%',
                opacity: id === activeTab ? 1 : 0,
                transition: 'opacity 0.15s ease',
              }}
            >
              <ErrorBoundary tabId={id}>
                <Component />
              </ErrorBoundary>
            </div>
          ))}
        </div>
      </div>
    </LayoutGroup>
  );
};

