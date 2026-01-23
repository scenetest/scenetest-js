import { Route } from '@solidjs/router'
import { Component, ParentProps } from 'solid-js'
import { Header } from './components/Header'
import { Footer } from './components/Footer'

// Pages
import Home from './routes/index'
import FAQ from './routes/faq'
import WritingSpecs from './routes/guides/writing-specs'
import Demo from './routes/demo'

const Layout: Component<ParentProps> = (props) => {
  return (
    <>
      <Header />
      <main class="content">
        {props.children}
      </main>
      <Footer />
    </>
  )
}

const App: Component<ParentProps> = (props) => {
  return (
    <Layout>
      <Route path="/" component={Home} />
      <Route path="/faq" component={FAQ} />
      <Route path="/guides/writing-specs" component={WritingSpecs} />
      <Route path="/demo" component={Demo} />
      {props.children}
    </Layout>
  )
}

export default App
