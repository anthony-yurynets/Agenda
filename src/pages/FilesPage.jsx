import { useEffect, useRef, useState } from 'react'
import { Copy, ExternalLink, RefreshCw, Trash2, Upload } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { generateToken } from '../lib/shareLinks'
import { FILES_BUCKET, fileUrl, formatSize, storagePath } from '../lib/files'
import FileIcon from '../components/FileIcon'

const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

/**
 * Files only the owner can upload; each gets a link (/f/<token>) that opens
 * just that file. Gated to FILES_OWNER in Workspace and by RLS.
 */
export default function FilesPage({ session, toast }) {
  const userId = session.user.id
  const [files, setFiles] = useState(null)
  const [uploading, setUploading] = useState([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('shared_files')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) return toast(error.message, 'error')
        setFiles([...data].sort((a, b) => b.created_at.localeCompare(a.created_at)))
      })
    return () => {
      cancelled = true
    }
  }, [toast])

  const copyLink = async (file, quiet) => {
    try {
      await navigator.clipboard.writeText(fileUrl(file))
      if (!quiet) toast('Link copied')
      return true
    } catch {
      if (!quiet) toast('Couldn’t copy — open the file and copy its address instead.', 'error')
      return false
    }
  }

  const upload = async (list) => {
    const picked = [...list]
    if (!picked.length) return
    setUploading((u) => [...u, ...picked.map((f) => f.name)])
    const done = []
    for (const f of picked) {
      const id = crypto.randomUUID()
      const path = storagePath(userId, id, f.name)
      const mime = f.type || 'application/octet-stream'
      const up = await supabase.storage.from(FILES_BUCKET).upload(path, f, { contentType: mime, upsert: false })
      if (up.error) {
        toast(`${f.name}: ${up.error.message}`, 'error')
      } else {
        const row = { id, user_id: userId, name: f.name.slice(0, 255), path, mime, size: f.size, token: generateToken() }
        const { data, error } = await supabase.from('shared_files').insert(row).select().single()
        if (error) {
          await supabase.storage.from(FILES_BUCKET).remove([path])
          toast(`${f.name}: ${error.message}`, 'error')
        } else {
          done.push(data)
        }
      }
      setUploading((u) => {
        const i = u.indexOf(f.name)
        return i < 0 ? u : [...u.slice(0, i), ...u.slice(i + 1)]
      })
    }
    if (!done.length) return
    setFiles((prev) => [...done.reverse(), ...(prev ?? [])])
    // One upload: put its link straight on the clipboard.
    if (done.length === 1 && (await copyLink(done[0], true))) toast(`Uploaded ${done[0].name} · link copied`)
    else toast(`Uploaded ${done.length} file${done.length === 1 ? '' : 's'}`)
  }

  const rotate = async (file) => {
    if (!confirm(`Make a new link for “${file.name}”? The old link will stop working.`)) return
    const token = generateToken()
    const { error } = await supabase.from('shared_files').update({ token }).eq('id', file.id)
    if (error) return toast(error.message, 'error')
    const next = { ...file, token }
    setFiles((prev) => prev.map((f) => (f.id === file.id ? next : f)))
    if (await copyLink(next, true)) toast('New link copied · the old one is off')
    else toast('New link made · the old one is off')
  }

  const remove = async (file) => {
    if (!confirm(`Delete “${file.name}”? Its link will stop working.`)) return
    const { error } = await supabase.from('shared_files').delete().eq('id', file.id)
    if (error) return toast(error.message, 'error')
    await supabase.storage.from(FILES_BUCKET).remove([file.path])
    setFiles((prev) => prev.filter((f) => f.id !== file.id))
    toast(`Deleted ${file.name}`)
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    upload(e.dataTransfer.files)
  }

  return (
    <div
      className={`files-page ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes('Files')) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setDragging(false)}
      onDrop={onDrop}
    >
      <button className="files-drop glass-tile" onClick={() => inputRef.current?.click()}>
        <Upload size={22} />
        <strong>{dragging ? 'Drop to upload' : 'Upload files'}</strong>
        <span className="muted small">Drag files here or click to choose. Any type. Each one gets its own link.</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          upload(e.target.files)
          e.target.value = ''
        }}
      />

      <section className="files-list glass-tile" aria-label="Your files">
        {uploading.map((name, i) => (
          <div key={`up-${i}`} className="file-row uploading">
            <span className="spinner sm" />
            <span className="file-name">{name}</span>
            <span className="muted small">Uploading…</span>
          </div>
        ))}
        {files === null && <div className="files-empty"><div className="spinner" /></div>}
        {files?.length === 0 && !uploading.length && <p className="files-empty muted">No files yet.</p>}
        {files?.map((f) => (
            <div key={f.id} className="file-row">
              <FileIcon file={f} />
              <a className="file-name" href={fileUrl(f)} target="_blank" rel="noreferrer" title={f.name}>
                {f.name}
              </a>
              <span className="file-meta muted small">
                {formatSize(f.size)} · {fmtDate(f.created_at)}
              </span>
              <div className="file-actions">
                <button className="btn sm primary" onClick={() => copyLink(f)}>
                  <Copy size={13} /> Copy link
                </button>
                <a className="icon-btn sm" href={fileUrl(f)} target="_blank" rel="noreferrer" aria-label={`Open ${f.name}`} title="Open">
                  <ExternalLink size={15} />
                </a>
                <button className="icon-btn sm" onClick={() => rotate(f)} aria-label={`New link for ${f.name}`} title="New link (turns the old one off)">
                  <RefreshCw size={15} />
                </button>
                <button className="icon-btn sm danger" onClick={() => remove(f)} aria-label={`Delete ${f.name}`} title="Delete">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
        ))}
      </section>
    </div>
  )
}
