import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { callShareApi } from '../lib/backends'
import { fileKind, formatSize } from '../lib/files'
import FileIcon from './FileIcon'
import Logo from './Logo'

// Bigger text files are offered as a download instead of shown.
const MAX_TEXT = 2 * 1024 * 1024

function TextView({ url }) {
  const [text, setText] = useState(null)
  useEffect(() => {
    let cancelled = false
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((t) => !cancelled && setText(t))
      .catch(() => !cancelled && setText(false))
    return () => {
      cancelled = true
    }
  }, [url])
  if (text === null) return <div className="boot"><div className="spinner" /></div>
  if (text === false) return <p className="muted fv-note">Couldn’t load a preview. Use Download instead.</p>
  return <pre className="fv-text">{text}</pre>
}

function Preview({ file }) {
  const kind = fileKind(file)
  if (kind === 'pdf') return <iframe className="fv-frame" src={file.url} title={file.name} />
  if (kind === 'image') return <div className="fv-media"><img src={file.url} alt={file.name} /></div>
  if (kind === 'video') return <div className="fv-media"><video src={file.url} controls playsInline /></div>
  if (kind === 'audio') return <div className="fv-media"><audio src={file.url} controls /></div>
  if (kind === 'text' && file.size <= MAX_TEXT) return <TextView url={file.url} />
  return (
    <div className="fv-other">
      <FileIcon file={file} size={40} />
      <p className="muted">No preview for this type of file.</p>
      <a className="btn primary" href={file.downloadUrl}>
        <Download size={15} /> Download {file.name}
      </a>
    </div>
  )
}

/** /f/<token>: one shared file, opened in a viewer for its type. No sign-in. */
export default function FileViewer({ token }) {
  const [state, setState] = useState({ status: 'loading' })
  useEffect(() => {
    callShareApi('/api/file', token, { op: 'open' }).then((res) =>
      setState(res.error ? { status: 'error', message: res.error.message } : { status: 'ready', file: res.data }),
    )
  }, [token])
  useEffect(() => {
    if (state.file) document.title = state.file.name
  }, [state.file])

  if (state.status === 'loading') return <div className="boot"><div className="spinner" /></div>
  if (state.status === 'error') {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-brand">
            <Logo size={30} />
            <span>Agenda</span>
          </div>
          <h1>This link doesn’t work</h1>
          <p className="muted">{state.message} Ask the person who shared it for a new one.</p>
        </div>
      </div>
    )
  }

  const { file } = state
  return (
    <div className="file-viewer">
      <header className="fv-head glass-tile">
        <FileIcon file={file} />
        <div className="fv-title">
          <h1 title={file.name}>{file.name}</h1>
          <span className="muted small">{formatSize(file.size)}</span>
        </div>
        <a className="btn sm ghost" href={file.downloadUrl}>
          <Download size={14} /> Download
        </a>
      </header>
      <main className="fv-body glass-tile">
        <Preview file={file} />
      </main>
    </div>
  )
}
