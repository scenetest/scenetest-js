/**
 * CSS styles for the recorder sidebar panel
 */

export const recorderStyles = `
#scenetest-recorder {
  position: fixed;
  top: 0;
  left: 0;
  width: 360px;
  height: 100vh;
  background: #0f0f1a;
  border-right: 2px solid #4a4a6a;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
  font-size: 12px;
  color: #e0e0e0;
  z-index: 999998;
  display: flex;
  flex-direction: column;
  box-shadow: 4px 0 24px rgba(0,0,0,0.4);
}
#scenetest-recorder.collapsed {
  width: 48px;
}
#scenetest-recorder.collapsed .recorder-header-title,
#scenetest-recorder.collapsed .recorder-actions,
#scenetest-recorder.collapsed .recorder-lines,
#scenetest-recorder.collapsed .recorder-footer {
  display: none;
}
#scenetest-recorder.collapsed .recorder-header {
  flex-direction: column;
  padding: 12px 8px;
  gap: 8px;
}

/* Push app content right when recorder is open */
#scenetest-recorder:not(.collapsed) ~ *,
#scenetest-recorder:not(.collapsed) ~ #scenetest-panel {
  /* Can't push siblings reliably; app should use the CSS var */
}

/* Header */
.recorder-header {
  padding: 12px 16px;
  background: #1a1a2e;
  border-bottom: 1px solid #4a4a6a;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}
.recorder-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.recorder-header-title {
  font-weight: 600;
  color: #a0a0ff;
  font-size: 13px;
}
.recorder-rec-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #f87171;
  animation: rec-pulse 1.2s ease-in-out infinite;
}
.recorder-rec-dot.paused {
  background: #6a6a8a;
  animation: none;
}
@keyframes rec-pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(248, 113, 113, 0.4); }
  50% { opacity: 0.6; box-shadow: 0 0 0 6px rgba(248, 113, 113, 0); }
}
.recorder-toggle-btn {
  background: none;
  border: 1px solid #4a4a6a;
  color: #a0a0a0;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
}
.recorder-toggle-btn:hover {
  background: #3a3a5a;
  color: #e0e0e0;
}

/* Actions bar */
.recorder-actions {
  padding: 8px 16px;
  background: #151528;
  border-bottom: 1px solid #3a3a5a;
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.recorder-btn {
  background: none;
  border: 1px solid #4a4a6a;
  color: #a0a0a0;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  font-family: inherit;
  transition: all 0.15s;
}
.recorder-btn:hover {
  background: #3a3a5a;
  color: #e0e0e0;
}
.recorder-btn.active {
  background: #4a4a6a;
  color: #fff;
}
.recorder-btn.danger:hover {
  background: #3a1a1a;
  color: #f87171;
  border-color: #f87171;
}
.recorder-btn.primary {
  background: #2a2a6a;
  color: #a0a0ff;
  border-color: #6a6aaa;
}
.recorder-btn.primary:hover {
  background: #3a3a8a;
  color: #c0c0ff;
}

/* Lines container */
.recorder-lines {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}
.recorder-empty {
  padding: 40px 20px;
  text-align: center;
  color: #6a6a8a;
  line-height: 1.6;
}
.recorder-empty-icon {
  font-size: 32px;
  margin-bottom: 12px;
}

/* Individual DSL line */
.recorder-line {
  padding: 6px 16px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  border-bottom: 1px solid #1a1a2e;
  transition: background 0.1s;
  cursor: default;
  min-height: 28px;
}
.recorder-line:hover {
  background: #1a1a2e;
}
.recorder-line:hover .recorder-line-delete {
  opacity: 1;
}
.recorder-line-number {
  color: #4a4a6a;
  font-size: 10px;
  min-width: 20px;
  text-align: right;
  padding-top: 2px;
  user-select: none;
  flex-shrink: 0;
}
.recorder-line-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.recorder-line-text {
  word-break: break-word;
  line-height: 1.5;
}

/* Syntax highlighting for DSL */
.recorder-action {
  color: #c792ea;
  font-weight: 500;
}
.recorder-selector {
  color: #82aaff;
}
.recorder-value {
  color: #c3e88d;
}

/* Delete button */
.recorder-line-delete {
  opacity: 0;
  background: none;
  border: none;
  color: #6a6a8a;
  cursor: pointer;
  font-size: 14px;
  padding: 0 4px;
  transition: all 0.1s;
  flex-shrink: 0;
}
.recorder-line-delete:hover {
  color: #f87171;
}

/* New line animation */
.recorder-line.new {
  animation: line-slide-in 0.2s ease-out;
}
@keyframes line-slide-in {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* Assertion annotation */
.recorder-annotation {
  padding: 3px 16px 3px 46px;
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 6px;
  animation: annotation-fade-in 0.3s ease-out;
}
.recorder-annotation.pass {
  color: #4ade80;
}
.recorder-annotation.fail {
  color: #f87171;
  background: rgba(248, 113, 113, 0.05);
}
.recorder-annotation-icon {
  font-size: 10px;
  flex-shrink: 0;
}
.recorder-annotation-text {
  font-style: italic;
}
@keyframes annotation-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Warning toast */
.recorder-warning {
  padding: 4px 16px 4px 46px;
  font-size: 11px;
  color: #f59e0b;
  display: flex;
  align-items: center;
  gap: 6px;
  animation: annotation-fade-in 0.3s ease-out;
}
.recorder-warning-icon {
  flex-shrink: 0;
}

/* Footer */
.recorder-footer {
  padding: 10px 16px;
  background: #1a1a2e;
  border-top: 1px solid #4a4a6a;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}
.recorder-line-count {
  color: #6a6a8a;
  font-size: 11px;
}
`
