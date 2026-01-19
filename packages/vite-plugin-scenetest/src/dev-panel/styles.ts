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
`
