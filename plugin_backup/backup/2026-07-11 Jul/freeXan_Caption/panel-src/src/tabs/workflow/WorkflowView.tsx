/**
 * freeXan Caption — Workflow Tab
 * Ported from workflow.js. A multi-step wizard for the caption pipeline.
 */
import React from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import './WorkflowView.css';
import { StepCheckProject } from './steps/StepCheckProject';
import { StepTranscribe } from './steps/StepTranscribe';
import { StepParseSrt } from './steps/StepParseSrt';
import { StepRender } from './steps/StepRender';

export const WorkflowView: React.FC = () => {
  const { currentStage, reset } = useWorkflowStore();

  return (
    <div className="fx-workflow-tab">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
        <button 
          className="fx-btn fx-btn--secondary" 
          onClick={reset} 
          style={{ padding: '6px 12px', fontSize: '11px' }}
          title="Reset workflow to Step 1"
        >
          <i className="fas fa-redo-alt" /> Reset Workflow
        </button>
      </div>
      <div className="fx-workflow-timeline">
        <div className="fx-workflow-line" />
        <StepCheckProject stepNum={1} active={currentStage === 1} completed={currentStage > 1} />
        <StepTranscribe   stepNum={2} active={currentStage === 2} completed={currentStage > 2} />
        <StepParseSrt     stepNum={3} active={currentStage === 3} completed={currentStage > 3} />
        <StepRender       stepNum={4} active={currentStage === 4} completed={currentStage > 4} />
      </div>
    </div>
  );
};
