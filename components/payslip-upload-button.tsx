'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export function PayslipUploadButton() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleFile(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('File too large — maximum 10 MB')
      return
    }
    setErrorMsg(null)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/payslips/upload', { method: 'POST', body: fd })
      if (res.ok) {
        setErrorMsg(null)
        router.refresh()
      } else if (res.status === 422) {
        setErrorMsg('Unrecognised payslip format — only MYOB PDFs are supported')
      } else {
        setErrorMsg('Upload failed')
      }
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        aria-label="Select payslip PDF"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="px-4 py-2 text-sm font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 disabled:opacity-50"
      >
        {uploading ? 'Uploading…' : 'Upload PDF'}
      </button>
      {errorMsg && (
        <p className="mt-2 text-sm text-red-600">{errorMsg}</p>
      )}
    </div>
  )
}
