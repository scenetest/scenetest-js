import { Component, ParentProps } from 'solid-js'

type CalloutType = 'info' | 'tip' | 'warning' | 'best-practice'

interface CalloutProps extends ParentProps {
  type?: CalloutType
  title?: string
}

const icons: Record<CalloutType, string> = {
  info: 'ℹ️',
  tip: '💡',
  warning: '⚠️',
  'best-practice': '✨',
}

const defaultTitles: Record<CalloutType, string> = {
  info: 'Info',
  tip: 'Tip',
  warning: 'Warning',
  'best-practice': 'Best Practice',
}

export const Callout: Component<CalloutProps> = (props) => {
  const type = () => props.type || 'info'

  return (
    <div class={`callout callout-${type()}`}>
      <div class="callout-header">
        <span class="callout-icon">{icons[type()]}</span>
        <span class="callout-title">{props.title || defaultTitles[type()]}</span>
      </div>
      <div class="callout-content">
        {props.children}
      </div>
    </div>
  )
}
