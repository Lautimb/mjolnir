import { createRoot } from 'react-dom/client'
import { connect } from '@mjolnir/plugin-sdk'
import { MjolnirProvider } from '@mjolnir/plugin-sdk/react'
import { App } from './App'
import './style.css'

const mjolnir = await connect()
createRoot(document.getElementById('app')!).render(
  <MjolnirProvider mjolnir={mjolnir}>
    <App />
  </MjolnirProvider>,
)
