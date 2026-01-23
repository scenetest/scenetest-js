/* @refresh reload */
import { render } from 'solid-js/web'
import { Router } from '@solidjs/router'
import App from './App'
import './styles.css'

// Initialize the observer panel for the demo
import { initObserver } from '@scenetest/observer'
initObserver()

render(
  () => (
    <Router root={App}>
      {/* Routes are defined in App.tsx */}
    </Router>
  ),
  document.getElementById('app')!
)
