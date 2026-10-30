import { File, FileAudio, FileImage, FileText, FileVideo } from 'lucide-react'
import { fileKind } from '../lib/files'

const ICONS = { pdf: FileText, image: FileImage, video: FileVideo, audio: FileAudio, text: FileText, other: File }

/** Type icon for a shared file, tinted by kind. */
export default function FileIcon({ file, size = 18 }) {
  const kind = fileKind(file)
  const Icon = ICONS[kind]
  return <Icon size={size} className={`file-icon k-${kind}`} />
}
