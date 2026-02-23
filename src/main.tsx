import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { TerminalWindow } from './components/TerminalWindow'

// Terminal windows pass worktreePath as a query param; render the lightweight
// terminal UI instead of the full app when that param is present.
const isTerminal = new URLSearchParams(window.location.search).has('worktreePath')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isTerminal ? <TerminalWindow /> : <App />}
  </React.StrictMode>
)
