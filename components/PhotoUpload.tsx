'use client'

import { useCallback, useState } from 'react'
import { Upload, ImageIcon, X, Link, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { compressImageBlob } from '@/lib/compress-image'
import { extractGpsExif, type ClientGpsExif } from '@/lib/extract-gps-exif'
import { cn } from '@/lib/utils'

export type ImageReadyPayload = {
  base64: string
  mimeType: string
  preview: string
  gpsExifPresent: boolean
  gpsExif?: ClientGpsExif
}

interface PhotoUploadProps {
  onImageReady: (payload: ImageReadyPayload) => void
  onClear: () => void
  preview: string | null
  disabled?: boolean
}

type Tab = 'file' | 'url'

export function PhotoUpload({ onImageReady, onClear, preview, disabled }: PhotoUploadProps) {
  const [dragging, setDragging] = useState(false)
  const [tab, setTab] = useState<Tab>('file')
  const [urlInput, setUrlInput] = useState('')
  const [urlError, setUrlError] = useState<{ title?: string; body: string } | null>(null)
  const [urlLoading, setUrlLoading] = useState(false)

  const processFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) return
      // EXIF must be read before canvas compression strips metadata.
      const gps = await extractGpsExif(file)
      const { base64, mimeType, preview } = await compressImageBlob(file)
      onImageReady({
        base64,
        mimeType,
        preview,
        gpsExifPresent: gps.gpsExifPresent,
        gpsExif: gps.gpsExif,
      })
    },
    [onImageReady]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) processFile(file)
    },
    [processFile]
  )

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const switchTab = (next: Tab) => {
    setTab(next)
    setUrlInput('')
    setUrlError(null)
    onClear()
  }

  const loadFromUrl = async () => {
    setUrlError(null)
    const trimmed = urlInput.trim()

    // Validate URL format
    try {
      const parsed = new URL(trimmed)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        setUrlError({ body: 'Please enter an http:// or https:// image URL.' })
        return
      }
    } catch {
      setUrlError({ body: 'Please enter a valid image URL.' })
      return
    }

    setUrlLoading(true)
    try {
      const response = await fetch(trimmed, { cache: 'no-cache' })
      if (!response.ok) {
        setUrlError({ body: `Couldn't fetch the image (HTTP ${response.status}). Check the URL and try again.` })
        return
      }
      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.startsWith('image/')) {
        setUrlError({ body: "The URL doesn't point to an image file." })
        return
      }
      const blob = await response.blob()
      const gps = await extractGpsExif(blob)
      const { base64, mimeType, preview } = await compressImageBlob(blob)
      onImageReady({
        base64,
        mimeType,
        preview,
        gpsExifPresent: gps.gpsExifPresent,
        gpsExif: gps.gpsExif,
      })
    } catch (err) {
      if (err instanceof TypeError) {
        // Network/CORS errors surface as TypeError in fetch
        setUrlError({
          title: 'Image blocked by host',
          body: "This image can't be loaded directly from your browser due to the host's security policy. Try downloading the image and uploading it instead.",
        })
      } else {
        setUrlError({ title: 'Something went wrong', body: 'Failed to load the image. Please try again.' })
      }
    } finally {
      setUrlLoading(false)
    }
  }

  if (preview) {
    return (
      <div className="relative rounded-xl overflow-hidden border bg-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={preview}
          alt="Uploaded photo"
          className="w-full max-h-96 object-contain bg-black/5"
        />
        {!disabled && (
          <button
            onClick={onClear}
            className="absolute top-2 right-2 bg-background/80 hover:bg-background rounded-full p-1 shadow transition-colors"
            aria-label="Remove image"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Tab toggle */}
      <div className="flex rounded-lg border bg-muted/30 p-1 gap-1">
        <button
          type="button"
          onClick={() => switchTab('file')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            tab === 'file'
              ? 'bg-background shadow text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Upload className="h-4 w-4" />
          Upload file
        </button>
        <button
          type="button"
          onClick={() => switchTab('url')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            tab === 'url'
              ? 'bg-background shadow text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Link className="h-4 w-4" />
          Enter URL
        </button>
      </div>

      {tab === 'file' ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn(
            'relative flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-12 text-center transition-colors cursor-pointer',
            dragging
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50 hover:bg-muted/30'
          )}
          onClick={() => document.getElementById('photo-input')?.click()}
        >
          <input
            id="photo-input"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            {dragging ? (
              <ImageIcon className="h-8 w-8 text-primary" />
            ) : (
              <Upload className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
          <div>
            <p className="text-base font-medium">
              {dragging ? 'Drop your photo here' : 'Upload a photo'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Drag & drop or click to browse · JPG, PNG, WEBP
            </p>
          </div>
          <Button variant="outline" size="sm" type="button" tabIndex={-1}>
            Choose file
          </Button>
          <Badge variant="secondary" className="font-normal text-muted-foreground">
            Best results with outdoor photos showing buildings, street signs, landscapes, or infrastructure.
          </Badge>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border-2 border-dashed border-border p-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mx-auto">
            <Link className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-base font-medium">Enter an image URL</p>
            <p className="text-sm text-muted-foreground mt-1">
              Paste a direct link to a publicly accessible image
            </p>
          </div>
          <div className="flex gap-2">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => { setUrlInput(e.target.value); setUrlError(null) }}
              onKeyDown={(e) => e.key === 'Enter' && !urlLoading && loadFromUrl()}
              placeholder="https://example.com/photo.jpg"
              disabled={urlLoading}
              className={cn(
                'flex-1 rounded-md border bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50',
                urlError ? 'border-destructive' : 'border-input'
              )}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={loadFromUrl}
              disabled={urlLoading || !urlInput.trim()}
              className="shrink-0"
            >
              {urlLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Load image'
              )}
            </Button>
          </div>
          {urlError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive text-center">
              {urlError.title && <p className="font-medium mb-1">{urlError.title}</p>}
              <p>{urlError.body}</p>
            </div>
          )}
          <Badge variant="secondary" className="font-normal text-muted-foreground self-center">
            Best results with outdoor photos showing buildings, street signs, landscapes, or infrastructure.
          </Badge>
        </div>
      )}
    </div>
  )
}
