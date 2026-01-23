import { A } from '@solidjs/router'
import { Component } from 'solid-js'

export const Header: Component = () => {
  return (
    <header class="header">
      <div class="header-inner">
        <A href="/" class="logo">
          <span class="logo-text">scenetest</span>
        </A>
        <nav class="nav">
          <A href="/">Home</A>
          <A href="/guides/writing-specs">Writing Specs</A>
          <A href="/faq">FAQ</A>
          <A href="/demo">Live Demo</A>
          <a href="https://github.com/scenetest/scenetest-js" target="_blank" rel="noopener">
            GitHub
          </a>
        </nav>
      </div>
    </header>
  )
}
