/**
 * CSS styles for the dev panel
 */

export const panelStyles = `
#scenetest-panel {
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
#scenetest-panel.collapsed {
  max-height: none;
  width: auto;
}
#scenetest-panel.collapsed #scenetest-list,
#scenetest-panel.collapsed #scenetest-actions {
  display: none;
}
#scenetest-header {
  padding: 10px 12px;
  background: #252542;
  border-radius: 8px 8px 0 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid #4a4a6a;
}
#scenetest-header:hover {
  background: #2a2a4a;
}
#scenetest-title {
  font-weight: 600;
  color: #a0a0ff;
}
#scenetest-counts {
  display: flex;
  gap: 8px;
  align-items: center;
}
.scenetest-count {
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}
.scenetest-count:hover {
  opacity: 0.8;
}
.scenetest-count.pass {
  background: #1a3a1a;
  color: #4ade80;
}
.scenetest-count.fail {
  background: #3a1a1a;
  color: #f87171;
}
.scenetest-count.active {
  outline: 2px solid currentColor;
  outline-offset: 1px;
}
#scenetest-actions {
  display: flex;
  gap: 8px;
  padding: 6px 12px;
  background: #202038;
  border-bottom: 1px solid #3a3a5a;
  flex-wrap: wrap;
  align-items: center;
}
.scenetest-btn-group {
  display: flex;
  border: 1px solid #4a4a6a;
  border-radius: 4px;
  overflow: hidden;
}
.scenetest-btn-group .scenetest-btn {
  border: none;
  border-radius: 0;
  border-right: 1px solid #4a4a6a;
}
.scenetest-btn-group .scenetest-btn:last-child {
  border-right: none;
}
.scenetest-btn {
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
.scenetest-btn:hover {
  background: #3a3a5a;
  color: #e0e0e0;
}
.scenetest-btn.active {
  background: #4a4a6a;
  color: #fff;
}
.scenetest-separator {
  width: 1px;
  height: 16px;
  background: #3a3a5a;
}
#scenetest-list {
  overflow-y: auto;
  max-height: 340px;
  padding: 8px 0;
}
.scenetest-group {
  margin: 4px 8px;
  border: 1px solid #3a3a5a;
  border-radius: 6px;
  overflow: hidden;
}
.scenetest-group-header {
  padding: 6px 10px;
  background: #252542;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  font-size: 11px;
}
.scenetest-group-header:hover {
  background: #2a2a4a;
}
.scenetest-group-summary {
  display: flex;
  gap: 8px;
  align-items: center;
}
.scenetest-group-time {
  color: #6a6a8a;
}
.scenetest-group-stats {
  display: flex;
  gap: 6px;
}
.scenetest-group-stat {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
}
.scenetest-group-stat.pass {
  background: #1a3a1a;
  color: #4ade80;
}
.scenetest-group-stat.fail {
  background: #3a1a1a;
  color: #f87171;
}
.scenetest-group-stat.zero {
  background: #2a2a3a;
  color: #6a6a8a;
}
.scenetest-group-items {
  border-top: 1px solid #3a3a5a;
}
.scenetest-group.collapsed .scenetest-group-items {
  display: none;
}
.scenetest-group-toggle {
  color: #6a6a8a;
  font-size: 10px;
}
.scenetest-item {
  padding: 6px 10px;
  border-bottom: 1px solid #2a2a4a;
  display: flex;
  gap: 8px;
  align-items: flex-start;
  cursor: pointer;
  position: relative;
}
.scenetest-item:hover {
  background: #252545;
}
.scenetest-item:last-child {
  border-bottom: none;
}
.scenetest-item.pass .scenetest-icon {
  color: #4ade80;
}
.scenetest-item.fail .scenetest-icon {
  color: #f87171;
}
.scenetest-icon {
  flex-shrink: 0;
  width: 14px;
  text-align: center;
}
.scenetest-content {
  flex: 1;
  min-width: 0;
}
.scenetest-desc {
  word-break: break-word;
}
.scenetest-item.fail .scenetest-desc {
  color: #f87171;
}
.scenetest-desc.negated {
  text-decoration: line-through;
  opacity: 0.7;
}
.scenetest-location {
  font-size: 9px;
  color: #6a6a8a;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.scenetest-location:hover {
  color: #a0a0ff;
  text-decoration: underline;
}
.scenetest-context {
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
.scenetest-time {
  color: #6a6a8a;
  flex-shrink: 0;
  font-size: 10px;
}
#scenetest-empty {
  padding: 20px;
  text-align: center;
  color: #6a6a8a;
}
.scenetest-ungrouped {
  padding: 4px 8px;
}
.scenetest-history {
  font-size: 9px;
  color: #8a8aaa;
  margin-top: 2px;
  font-style: italic;
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
  width: 18px;
  text-align: center;
  flex-shrink: 0;
}
.item.pass .icon { color: #4ade80; }
.item.fail .icon { color: #f87171; }
.content {
  flex: 1;
}
.desc {
  margin-bottom: 4px;
  word-break: break-word;
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.location-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
.status-dots {
  display: flex;
  gap: 3px;
  align-items: center;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transition: transform 0.15s;
}
.status-dot.pass {
  background: #4ade80;
}
.status-dot.fail {
  background: #f87171;
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
  margin-bottom: 16px;
}
.sequence-location {
  margin-bottom: 8px;
}
.sequence-file {
  color: #a0a0ff;
  font-size: 14px;
  cursor: pointer;
}
.sequence-file:hover {
  text-decoration: underline;
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
.sequence-entry {
  padding: 10px 16px;
  background: #12121f;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  border: 1px solid #3a3a5a;
  border-radius: 6px;
  margin-bottom: 8px;
}
.sequence-entry.fail {
  background: #1a1212;
  border-color: #4a2a2a;
}
.sequence-entry.pass .icon { color: #4ade80; }
.sequence-entry.fail .icon { color: #f87171; }
.sequence-time {
  font-size: 11px;
  color: #6a6a8a;
  margin-bottom: 4px;
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
`
