'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export function PayslipUploadButton() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFile(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/payslips/upload', { method: 'POST', body: fd })
      if (res.ok) {
        router.refresh()
      } else if (res.status === 422) {
        alert('Unrecognised payslip format — only MYOB PDFs are supported')
      } else {
        alert('Upload failed')
      }
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
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
    </>
  )
}
