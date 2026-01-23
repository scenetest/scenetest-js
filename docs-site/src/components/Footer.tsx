import { Component } from 'solid-js'

export const Footer: Component = () => {
  return (
    <footer class="footer">
      <div class="footer-inner">
        <p>
          Scenetest is open source software.{' '}
          <a href="https://github.com/scenetest/scenetest-js" target="_blank" rel="noopener">
            View on GitHub
          </a>
        </p>
      </div>
    </footer>
  )
}
