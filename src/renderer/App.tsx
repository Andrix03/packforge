import { useEffect, useState } from 'react'
import type { AppInfo } from '../shared/ipc'

type InfoState =
  { status: 'loading' } | { status: 'ready'; info: AppInfo } | { status: 'error'; message: string }

export function App(): React.JSX.Element {
  const [state, setState] = useState<InfoState>({ status: 'loading' })

  useEffect(() => {
    window.api
      .invoke('app:getInfo')
      .then((info) => setState({ status: 'ready', info }))
      .catch((error: unknown) =>
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : String(error)
        })
      )
  }, [])

  return (
    <main className="app">
      <header>
        <h1>PackForge</h1>
        <p>Studio per resource pack Minecraft Java con anteprima LabPBR</p>
      </header>

      <section className="card">
        <h2>Informazioni</h2>
        {state.status === 'loading' && <p>Caricamento…</p>}
        {state.status === 'error' && <p className="error">Errore IPC: {state.message}</p>}
        {state.status === 'ready' && (
          <dl>
            <dt>Versione</dt>
            <dd>{state.info.version}</dd>
            <dt>Electron</dt>
            <dd>{state.info.electron}</dd>
            <dt>Chromium</dt>
            <dd>{state.info.chrome}</dd>
            <dt>Node</dt>
            <dd>{state.info.node}</dd>
            <dt>Piattaforma</dt>
            <dd>{state.info.platform}</dd>
          </dl>
        )}
      </section>
    </main>
  )
}
