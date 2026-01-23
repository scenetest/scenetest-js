/* @refresh reload */
import { render } from 'solid-js/web'
import './styles.css'

// Initialize the observer panel
import { initObserver } from '@scenetest/observer'

// Import pages
import Home from './pages/Home'

// Initialize observer when DOM is ready
if (typeof window !== 'undefined') {
  initObserver()
}

render(() => <Home />, document.getElementById('app')!)
