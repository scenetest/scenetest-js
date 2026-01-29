/**
 * CSS styles for the dev panel
 */

export const panelStyles = `
#scenecheck-panel {
  position: fixed;
  bottom: 16px;
  right: 16px;
  width: 400px;
  max-height: 450px;
  background: #1a1a2e;
  border: 1px solid #4a4a6a;
  border-radius: 8px;
  font-family: ui-monospace, monospace;
  font-size: 12px;
  color: #e0e0e0;
  z-index: 999999;
  box-shadow: 0 4px 24px rgba(0,0,0,0.4);
  display: flex;
  flex-direction: column;
}
#scenecheck-panel.dragging {
  opacity: 0.92;
}
#scenecheck-panel.unsnapping {
  transition: top 0.12s cubic-bezier(0.2, 0, 0, 1),
              left 0.12s cubic-bezier(0.2, 0, 0, 1),
              box-shadow 0.12s ease;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}
#scenecheck-panel.snapping {
  transition: top 0.3s cubic-bezier(0.2, 0, 0.2, 1),
              left 0.3s cubic-bezier(0.2, 0, 0.2, 1);
}
#scenecheck-panel.flicking {
  transition: top 0.4s cubic-bezier(0.16, 1, 0.3, 1),
              left 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
#scenecheck-panel.corner-bottom-right {
  bottom: 16px;
  right: 16px;
  top: auto;
  left: auto;
}
#scenecheck-panel.corner-bottom-left {
  bottom: 16px;
  left: 16px;
  top: auto;
  right: auto;
}
#scenecheck-panel.corner-top-right {
  top: 16px;
  right: 16px;
  bottom: auto;
  left: auto;
}
#scenecheck-panel.corner-top-left {
  top: 16px;
  left: 16px;
  bottom: auto;
  right: auto;
}
#scenecheck-panel.collapsed {
  max-height: none;
  width: auto;
}
#scenecheck-panel.collapsed #scenecheck-list,
#scenecheck-panel.collapsed #scenecheck-actions {
  display: none;
}
#scenecheck-header {
  padding: 10px 12px;
  background: #252542;
  border-radius: 8px 8px 0 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: grab;
  user-select: none;
  border-bottom: 1px solid #4a4a6a;
}
#scenecheck-panel.dragging #scenecheck-header {
  cursor: grabbing;
}
#scenecheck-header:hover {
  background: #2a2a4a;
}
#scenecheck-title {
  font-weight: 600;
  color: #a0a0ff;
  display: flex;
  align-items: center;
  gap: 6px;
}
.scenecheck-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #a0a0ff;
  font-size: 12px;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
}
.scenecheck-icon span {
  filter: drop-shadow(0px 0px 4px #ffffff);
}
#scenecheck-counts {
  display: flex;
  gap: 8px;
  align-items: center;
}
.scenecheck-count {
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}
.scenecheck-count:hover {
  opacity: 0.8;
}
.scenecheck-count.pass {
  background: #1a3a1a;
  color: #4ade80;
}
.scenecheck-count.fail {
  background: #3a1a1a;
  color: #f87171;
}
.scenecheck-count.active {
  outline: 2px solid currentColor;
  outline-offset: 1px;
}
#scenecheck-actions {
  display: flex;
  gap: 8px;
  padding: 6px 12px;
  background: #202038;
  border-bottom: 1px solid #3a3a5a;
  flex-wrap: wrap;
  align-items: center;
}
.scenecheck-btn-group {
  display: flex;
  border: 1px solid #4a4a6a;
  border-radius: 4px;
  overflow: hidden;
}
.scenecheck-btn-group .scenecheck-btn {
  border: none;
  border-radius: 0;
  border-right: 1px solid #4a4a6a;
}
.scenecheck-btn-group .scenecheck-btn:last-child {
  border-right: none;
}
.scenecheck-btn {
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
.scenecheck-btn:hover {
  background: #3a3a5a;
  color: #e0e0e0;
}
.scenecheck-btn.active {
  background: #4a4a6a;
  color: #fff;
}
.scenecheck-separator {
  width: 1px;
  height: 16px;
  background: #3a3a5a;
}
#scenecheck-list {
  overflow-y: auto;
  max-height: 340px;
  padding: 8px 0;
}
.scenecheck-group {
  margin: 4px 8px;
  border: 1px solid #3a3a5a;
  border-radius: 6px;
  overflow: hidden;
}
.scenecheck-group-header {
  padding: 6px 10px;
  background: #252542;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  font-size: 11px;
}
.scenecheck-group-header:hover {
  background: #2a2a4a;
}
.scenecheck-group-summary {
  display: flex;
  gap: 8px;
  align-items: center;
}
.scenecheck-group-time {
  color: #6a6a8a;
}
.scenecheck-group-stats {
  display: flex;
  gap: 6px;
}
.scenecheck-group-stat {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
}
.scenecheck-group-stat.pass {
  background: #1a3a1a;
  color: #4ade80;
}
.scenecheck-group-stat.fail {
  background: #3a1a1a;
  color: #f87171;
}
.scenecheck-group-stat.zero {
  background: #2a2a3a;
  color: #6a6a8a;
}
.scenecheck-group-items {
  border-top: 1px solid #3a3a5a;
}
.scenecheck-group.collapsed .scenecheck-group-items {
  display: none;
}
.scenecheck-group-toggle {
  color: #6a6a8a;
  font-size: 10px;
}
.scenecheck-item {
  padding: 6px 10px;
  border-bottom: 1px solid #2a2a4a;
  display: flex;
  gap: 8px;
  align-items: flex-start;
  cursor: pointer;
  position: relative;
}
.scenecheck-item:hover {
  background: #252545;
}
.scenecheck-item:last-child {
  border-bottom: none;
}
.scenecheck-item .scenecheck-icon {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-weight: bold;
  text-align: center;
}
.scenecheck-item.pass .scenecheck-icon {
  background: #22c55e;
  color: white;
  font-size: 14px;
}
.scenecheck-item.fail .scenecheck-icon {
  background: #f87171;
  color: white;
  font-size: 20px;
  box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.3);
}
.scenecheck-content {
  flex: 1;
  min-width: 0;
}
.scenecheck-desc {
  word-break: break-word;
}
.scenecheck-item.fail .scenecheck-desc {
  color: #f87171;
}
.scenecheck-desc.negated {
  text-decoration: line-through;
  opacity: 0.7;
}
.scenecheck-location {
  font-size: 9px;
  color: #6a6a8a;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.scenecheck-location:hover {
  color: #a0a0ff;
  text-decoration: underline;
}
.scenecheck-context {
  font-size: 10px;
  color: #8a8aaa;
  margin-top: 3px;
  padding: 4px 6px;
  background: #12122a;
  border-radius: 3px;
  font-family: ui-monospace, monospace;
  max-height: 60px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
.scenecheck-time {
  color: #6a6a8a;
  flex-shrink: 0;
  font-size: 10px;
}
#scenecheck-empty {
  padding: 20px;
  text-align: center;
  color: #6a6a8a;
}
.scenecheck-ungrouped {
  padding: 4px 8px;
}
.scenecheck-history {
  font-size: 9px;
  color: #8a8aaa;
  margin-top: 2px;
  font-style: italic;
}
/* Audio controls */
.scenecheck-audio-controls {
  display: flex;
}
.scenecheck-audio-btn {
  min-width: 32px;
  padding: 4px 8px;
  font-size: 14px;
  transition: all 0.15s;
}
.scenecheck-audio-btn:hover {
  background: #3a3a5a;
}
.scenecheck-audio-btn.muted {
  opacity: 0.5;
}
.scenecheck-audio-btn.playing {
  background: #2a4a2a;
  color: #4ade80;
  animation: scenecheck-pulse 1s ease-in-out infinite;
}
@keyframes scenecheck-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
/* Note badge for musical indicators */
.scenecheck-note {
  font-size: 9px;
  padding: 2px 5px;
  border-radius: 3px;
  font-family: ui-monospace, monospace;
  flex-shrink: 0;
  opacity: 0.7;
  transition: opacity 0.15s;
}
.scenecheck-note:hover {
  opacity: 1;
}
.scenecheck-note.pass {
  background: #1a3a1a;
  color: #4ade80;
}
.scenecheck-note.fail {
  background: #3a1a1a;
  color: #f87171;
}
/* Server badge for multi-context assertions */
.scenecheck-server-badge {
  display: inline-block;
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 3px;
  background: #3a2a5a;
  color: #c4b5fd;
  margin-right: 6px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  vertical-align: middle;
}
.scenecheck-item.server {
  border-left: 2px solid #a78bfa;
}
`

export const fullscreenStyles = `
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 0;
  background: #0f0f1a;
  color: #e0e0e0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
  font-size: 13px;
}
#header {
  position: sticky;
  top: 0;
  background: #1a1a2e;
  border-bottom: 1px solid #4a4a6a;
  padding: 16px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 100;
  flex-wrap: wrap;
  gap: 12px;
}
#title {
  font-size: 18px;
  font-weight: 600;
  color: #a0a0ff;
  display: flex;
  align-items: center;
  gap: 10px;
}
#title .icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #a0a0ff;
  font-size: 18px;
  filter: drop-shadow(0 2px 6px rgba(0,0,0,0.3));
}
#title .icon span {
  filter: drop-shadow(0px 0px 5px #ffffff);
}
#controls {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
#counts {
  display: flex;
  gap: 12px;
  align-items: center;
}
.count {
  padding: 4px 12px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 14px;
}
.count.pass {
  background: #1a3a1a;
  color: #4ade80;
}
.count.fail {
  background: #3a1a1a;
  color: #f87171;
}
.btn {
  background: #252542;
  border: 1px solid #4a4a6a;
  color: #a0a0a0;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  transition: all 0.15s;
}
.btn:hover {
  background: #3a3a5a;
  color: #e0e0e0;
}
.btn.active {
  background: #4a4a6a;
  color: #fff;
}
#filters {
  display: flex;
  gap: 0;
}
.btn-group {
  display: flex;
  border: 1px solid #4a4a6a;
  border-radius: 6px;
  overflow: hidden;
}
.btn-group .btn {
  border: none;
  border-radius: 0;
  border-right: 1px solid #4a4a6a;
}
.btn-group .btn:last-child {
  border-right: none;
}
.separator {
  width: 1px;
  height: 24px;
  background: #4a4a6a;
}
#list {
  padding: 16px;
}
.ungrouped-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.group {
  margin-bottom: 16px;
  border: 1px solid #3a3a5a;
  border-radius: 8px;
  overflow: hidden;
}
.group-header {
  padding: 12px 16px;
  background: #1a1a2e;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
}
.group-header:hover {
  background: #252542;
}
.group-info {
  display: flex;
  gap: 16px;
  align-items: center;
}
.group-time {
  color: #a0a0ff;
  font-weight: 500;
}
.group-stats {
  display: flex;
  gap: 8px;
}
.group-stat {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}
.group-stat.pass {
  background: #1a3a1a;
  color: #4ade80;
}
.group-stat.fail {
  background: #3a1a1a;
  color: #f87171;
}
.group-toggle {
  color: #6a6a8a;
  font-size: 12px;
}
.group-items {
  border-top: 1px solid #3a3a5a;
}
.group.collapsed .group-items {
  display: none;
}
.item {
  padding: 10px 16px;
  background: #12121f;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  border-bottom: 1px solid #2a2a4a;
}
.item:last-child {
  border-bottom: none;
}
.item.fail {
  background: #1a1212;
}
.icon {
  font-size: 14px;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-weight: bold;
  text-align: center;
  flex-shrink: 0;
}
.item.pass .icon {
  background: #22c55e;
  color: white;
}
.item.fail .icon {
  background: #f87171;
  color: white;
  font-size: 20px;
  box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.3);
}
.content {
  flex: 1;
}
.desc {
  margin-bottom: 4px;
  word-break: break-word;
}
.desc[data-action] {
  cursor: pointer;
  border-radius: 3px;
  padding: 1px 3px;
  margin: -1px -3px;
}
.desc[data-action]:hover {
  background: rgba(160, 160, 255, 0.1);
}
.item.fail .desc {
  color: #f87171;
}
.desc.negated {
  text-decoration: line-through;
  opacity: 0.7;
}
.location {
  font-size: 11px;
  color: #6a6a8a;
  margin-top: 4px;
  cursor: pointer;
}
.location:hover {
  color: #a0a0ff;
  text-decoration: underline;
}
.context {
  margin-top: 8px;
  padding: 8px;
  background: #0a0a12;
  border-radius: 4px;
  font-size: 11px;
  color: #a0a0c0;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 100px;
  overflow: auto;
}
.meta {
  font-size: 11px;
  color: #6a6a8a;
}
.stack {
  margin-top: 8px;
  padding: 8px;
  background: #0a0a12;
  border-radius: 4px;
  font-size: 11px;
  color: #8a8a9a;
  white-space: pre-wrap;
  word-break: break-all;
}
.history {
  font-size: 11px;
  color: #8a8aaa;
  margin-top: 4px;
  font-style: italic;
}
#empty {
  text-align: center;
  padding: 60px 20px;
  color: #6a6a8a;
}
#empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}
.group.highlighted {
  box-shadow: 0 0 0 3px #a0a0ff, 0 0 20px rgba(160, 160, 255, 0.4);
}

/* View mode toggle */
#view-modes {
  display: flex;
  gap: 0;
}

/* Location view styles */
.location-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #12121f;
  border: 1px solid #3a3a5a;
  border-radius: 8px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.15s;
}
.location-row:hover {
  background: #1a1a2e;
  border-color: #4a4a6a;
}
.location-row.all-pass {
  border-left: 3px solid #4ade80;
}
.location-row.has-fails {
  border-left: 3px solid #f59e0b;
}
.location-row.last-fail {
  border-left: 3px solid #f87171;
  background: #1a1212;
}
.location-main {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  min-width: 0;
}
.location-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.location-file {
  font-size: 12px;
  color: #a0a0ff;
  font-weight: 500;
}
.location-desc {
  font-size: 13px;
  color: #e0e0e0;
}
.location-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
/* Current state icon - prominent indicator on the left */
.state-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: bold;
  border-radius: 50%;
  flex-shrink: 0;
  margin-right: 12px;
}
.state-icon.pass {
  background: #1a3a1a;
  color: #4ade80;
}
.state-icon.warn {
  background: #3a2a0a;
  color: #f59e0b;
}
.state-icon.fail {
  background: #f87171;
  color: white;
  font-size: 20px;
  box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.3);
}

.status-dots {
  display: flex;
  gap: 4px;
  align-items: center;
}
.status-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  transition: transform 0.15s;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.status-dot.pass {
  background: #4ade80;
}
.status-dot.fail {
  background: #f87171;
}
/* Accessibility: X marker on failure dots for colorblind users */
.status-dot .dot-x {
  position: absolute;
  color: white;
  font-size: 20px;
  font-weight: bold;
  line-height: 1;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-shadow: 0 0 2px rgba(0,0,0,0.5);
}
.status-dot:last-child {
  animation: pulse-dot 0.5s ease-out;
}
@keyframes pulse-dot {
  0% { transform: scale(1.5); }
  100% { transform: scale(1); }
}
.location-count {
  font-size: 11px;
  color: #6a6a8a;
}
.location-summary {
  display: flex;
  gap: 6px;
}
.location-summary .stat {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
}
.location-summary .stat.pass {
  background: #1a3a1a;
  color: #4ade80;
}
.location-summary .stat.fail {
  background: #3a1a1a;
  color: #f87171;
}
.location-actions {
  margin-left: 12px;
}
.loc-btn {
  background: #252542;
  border: 1px solid #4a4a6a;
  color: #a0a0a0;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
.loc-btn:hover {
  background: #3a3a5a;
  color: #e0e0e0;
}

/* Sequence view styles */
.sequence-header {
  background: #1a1a2e;
  border: 1px solid #4a4a6a;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 8px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  border-left: 3px solid #4ade80;
}
.sequence-header.warn {
  border-left-color: #f59e0b;
  background: linear-gradient(90deg, rgba(245, 158, 11, 0.1) 0%, #1a1a2e 50%);
}
.sequence-header.fail {
  border-left-color: #f87171;
  background: linear-gradient(90deg, rgba(248, 113, 113, 0.1) 0%, #1a1a2e 50%);
}
.sequence-info {
  flex: 1;
}
.sequence-location {
  margin-bottom: 4px;
}
.sequence-file {
  color: #a0a0ff;
  font-size: 14px;
  cursor: pointer;
}
.sequence-file:hover {
  text-decoration: underline;
}
.sequence-desc {
  font-size: 15px;
  color: #e0e0e0;
  margin-bottom: 8px;
}
.sequence-header.warn .sequence-desc {
  color: #f59e0b;
}
.sequence-header.fail .sequence-desc {
  color: #f87171;
}
.sequence-summary {
  display: flex;
  align-items: center;
  gap: 16px;
}
.sequence-total {
  color: #6a6a8a;
  font-size: 12px;
}
.sequence-stats {
  display: flex;
  gap: 8px;
}
.sequence-stats .stat {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}
.sequence-stats .stat.pass {
  background: #1a3a1a;
  color: #4ade80;
}
.sequence-stats .stat.fail {
  background: #3a1a1a;
  color: #f87171;
}

/* Flaky test info styles - own line in location row */
.flaky-info {
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 4px;
  font-family: ui-monospace, monospace;
  margin-top: 2px;
}
.flaky-info.failing {
  background: #3a1a1a;
  color: #f87171;
}
.flaky-info.resolved {
  background: #1a3a1a;
  color: #4ade80;
}

.flaky-status {
  font-size: 12px;
  padding: 8px 12px;
  margin-top: 8px;
  border-radius: 4px;
  background: #3a1a1a;
  color: #f87171;
  border-left: 3px solid #f87171;
  font-family: ui-monospace, monospace;
}

.resolution-info {
  font-size: 12px;
  padding: 8px 12px;
  margin-top: 6px;
  border-radius: 4px;
  background: #1a3a1a;
  color: #4ade80;
  border-left: 3px solid #4ade80;
  font-family: ui-monospace, monospace;
}

/* Direction hint */
.sequence-direction-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  margin-bottom: 8px;
  color: #6a6a8a;
  font-size: 11px;
  background: #0f0f1a;
  border-radius: 4px;
}
.direction-arrow {
  color: #a0a0ff;
  font-size: 14px;
}

/* Timeline track for sequence entries */
.sequence-list {
  position: relative;
  padding-left: 8px;
}
.sequence-entry {
  padding: 12px 16px 12px 0;
  background: #12121f;
  display: flex;
  gap: 0;
  align-items: stretch;
  border: 1px solid #3a3a5a;
  border-radius: 6px;
  margin-bottom: 0;
  margin-left: 20px;
  position: relative;
}
.sequence-entry.fail {
  background: #1a1212;
  border-color: #4a2a2a;
}

/* Timeline track with connecting line */
.timeline-track {
  width: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  flex-shrink: 0;
}
.timeline-line {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: 2px;
  background: #3a3a5a;
  top: -8px;
  bottom: -8px;
}
.timeline-line.first {
  top: 50%;
}
.timeline-line.last {
  bottom: 50%;
}
.timeline-line.first.last {
  display: none;
}
.timeline-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 4px;
}
.timeline-dot.pass {
  background: #4ade80;
  box-shadow: 0 0 0 3px #1a3a1a;
}
.timeline-dot.fail {
  background: #f87171;
  box-shadow: 0 0 0 3px #3a1a1a;
}
.timeline-dot .dot-x {
  color: white;
  font-size: 20px;
  font-weight: bold;
  line-height: 1;
  text-shadow: 0 0 2px rgba(0,0,0,0.5);
}

.sequence-entry .content {
  flex: 1;
  padding-left: 8px;
}
.sequence-time {
  font-size: 11px;
  color: #6a6a8a;
  margin-bottom: 4px;
}

/* End label */
.sequence-end-label {
  margin-left: 20px;
  padding: 8px 16px 8px 40px;
  color: #6a6a8a;
  font-size: 11px;
  position: relative;
}
.sequence-end-label::before {
  content: '';
  position: absolute;
  left: 28px;
  top: 0;
  width: 2px;
  height: 8px;
  background: #3a3a5a;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 16px;
  color: #a0a0ff;
  cursor: pointer;
  font-size: 13px;
}
.back-btn:hover {
  text-decoration: underline;
}

/* Audio controls */
#audio-controls {
  display: flex;
}
.audio-btn {
  min-width: 40px;
  padding: 8px 12px;
  font-size: 16px;
  transition: all 0.15s;
}
.audio-btn:hover {
  background: #3a3a5a;
}
.audio-btn.muted {
  opacity: 0.5;
}
.audio-btn.playing {
  background: #2a4a2a;
  color: #4ade80;
  animation: audio-pulse 1s ease-in-out infinite;
}
@keyframes audio-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
/* Note badge for musical indicators */
.note-badge {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  font-family: ui-monospace, monospace;
  flex-shrink: 0;
  opacity: 0.7;
  transition: all 0.15s;
  align-self: flex-start;
  margin-top: 2px;
}
.note-badge:hover {
  opacity: 1;
  transform: scale(1.1);
}
.note-badge.pass {
  background: #1a3a1a;
  color: #4ade80;
}
.note-badge.fail {
  background: #3a1a1a;
  color: #f87171;
}
.note-badge.warn {
  background: #3a2a0a;
  color: #f59e0b;
}
/* Server badge for multi-context assertions */
.server-badge {
  display: inline-block;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #3a2a5a;
  color: #c4b5fd;
  margin-right: 8px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  vertical-align: middle;
}
.item.server {
  border-left: 3px solid #a78bfa;
}
.note-badge.clickable {
  cursor: pointer;
}
.note-badge.clickable:hover {
  opacity: 1;
  transform: scale(1.15);
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.note-badge.clickable:active {
  transform: scale(0.95);
}

/* Piano roll visualization - grid style */
.piano-roll {
  background: #12121f;
  border: 1px solid #3a3a5a;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
  overflow-x: auto;
}
.piano-roll-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.piano-roll-title {
  font-weight: 600;
  color: #a0a0ff;
  font-size: 14px;
}
.piano-roll-hint {
  font-size: 11px;
  color: #6a6a8a;
}
.piano-grid {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.piano-row {
  display: flex;
  align-items: center;
  gap: 8px;
  border-left: 3px solid transparent;
  padding-left: 4px;
}
.piano-row.pass {
  border-left-color: #4ade80;
}
.piano-row.warn {
  border-left-color: #f59e0b;
}
.piano-row.fail {
  border-left-color: #f87171;
}
.piano-note {
  font-family: ui-monospace, monospace;
  font-weight: 600;
  min-width: 28px;
  font-size: 11px;
  text-align: right;
  padding-right: 6px;
}
.piano-row.pass .piano-note {
  color: #4ade80;
}
.piano-row.warn .piano-note {
  color: #f59e0b;
}
.piano-row.fail .piano-note {
  color: #f87171;
}
.piano-cells {
  display: flex;
  gap: 2px;
}
.piano-cell {
  width: 14px;
  height: 14px;
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.1s;
}
.piano-cell.empty {
  background: #1a1a2e;
}
.piano-cell.empty:hover {
  background: #2a2a4a;
}
.piano-cell.pass {
  background: #4ade80;
  box-shadow: 0 0 4px rgba(74, 222, 128, 0.4);
}
.piano-cell.pass:hover {
  transform: scale(1.2);
  box-shadow: 0 0 8px rgba(74, 222, 128, 0.6);
}
.piano-cell.fail {
  background: #f87171;
  box-shadow: 0 0 4px rgba(248, 113, 113, 0.4);
}
.piano-cell.fail:hover {
  transform: scale(1.2);
  box-shadow: 0 0 8px rgba(248, 113, 113, 0.6);
}
/* Column highlight on hover */
.piano-roll.col-hover .piano-cell[data-col].col-active {
  filter: brightness(1.3);
}
.piano-timeline {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  padding-left: 4px;
}
.piano-time-markers {
  display: flex;
  gap: 2px;
}
.piano-time-marker {
  width: 14px;
  height: 6px;
  background: #2a2a4a;
  border-radius: 1px;
  cursor: pointer;
  transition: all 0.1s;
}
.piano-time-marker:hover {
  background: #a0a0ff;
}
.piano-time-marker.playing {
  background: #a0a0ff;
  animation: piano-marker-pulse 0.3s ease-out;
}
@keyframes piano-marker-pulse {
  0% { transform: scaleY(2); }
  100% { transform: scaleY(1); }
}

/* Chord tooltip styles */
.chord-trigger {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.15s;
}
.chord-trigger:hover {
  background: #2a2a4a;
}
.chord-icon {
  font-size: 12px;
  opacity: 0.5;
  transition: opacity 0.15s;
}
.chord-trigger:hover .chord-icon {
  opacity: 1;
}
.chord-tooltip {
  position: fixed;
  z-index: 10000;
  background: #1a1a2e;
  border: 1px solid #4a4a6a;
  border-radius: 8px;
  padding: 12px;
  min-width: 280px;
  max-width: 400px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  animation: chord-fade-in 0.15s ease-out;
}
@keyframes chord-fade-in {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
.chord-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #3a3a5a;
}
.chord-title {
  font-weight: 600;
  color: #a0a0ff;
}
.chord-stats {
  display: flex;
  gap: 8px;
  font-size: 12px;
}
.chord-stats .pass {
  color: #4ade80;
}
.chord-stats .fail {
  color: #f87171;
}
.chord-notes {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.chord-note {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 12px;
}
.chord-note.pass {
  background: #1a3a1a;
}
.chord-note.fail {
  background: #3a1a1a;
}
.note-indicator {
  font-family: ui-monospace, monospace;
  font-weight: 600;
  min-width: 36px;
}
.chord-note.pass .note-indicator {
  color: #4ade80;
}
.chord-note.fail .note-indicator {
  color: #f87171;
}
.note-desc {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #e0e0e0;
}
.note-status {
  font-size: 14px;
}
.chord-note.pass .note-status {
  color: #4ade80;
}
.chord-note.fail .note-status {
  color: #f87171;
}
`
