'use client'

import { useEffect, useRef, useState } from 'react'
import { Zap, Globe, Lock, ScanSearch, Loader2, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { PhotoUpload, type ImageReadyPayload } from '@/components/PhotoUpload'
import { AnalysisResults, type Location } from '@/components/AnalysisResults'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ThemeToggle } from '@/components/ThemeToggle'
import type { ClientGpsExif } from '@/lib/extract-gps-exif'

type GateErrorMessage = { title: string; body: string }

type PageState =
  | { status: 'idle' }
  | { status: 'gating' }
  | { status: 'analyzing' }
  | { status: 'done'; locations: Location[]; preview: string | null }
  | { status: 'error'; message: string }
  | { status: 'rejected'; title: string; body: string }

type ProgressStage = {
  upTo: number
  progress: number
  message: string
}

const PROGRESS_STAGES: ProgressStage[] = [
  { upTo: 3, progress: 5, message: 'Uploading image…' },
  { upTo: 10, progress: 20, message: 'Scanning visual cues…' },
  { upTo: 20, progress: 40, message: 'Analyzing architecture & infrastructure…' },
  { upTo: 35, progress: 60, message: 'Synthesizing geographic evidence…' },
  { upTo: 50, progress: 80, message: 'Calibrating confidence levels…' },
  { upTo: 60, progress: 92, message: 'Finalizing results…' },
  { upTo: Infinity, progress: 95, message: 'This is taking longer than expected…' },
]

function getStage(elapsed: number): ProgressStage {
  return PROGRESS_STAGES.find((s) => elapsed < s.upTo) ?? PROGRESS_STAGES[PROGRESS_STAGES.length - 1]
}

export default function HomePage() {
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [imageMimeType, setImageMimeType] = useState<string>('image/jpeg')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [gpsExif, setGpsExif] = useState<ClientGpsExif | undefined>(undefined)
  const [gpsExifPresent, setGpsExifPresent] = useState(false)
  const [error, setError] = useState<GateErrorMessage | string | null>(null)
  const [pageState, setPageState] = useState<PageState>({ status: 'idle' })
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (pageState.status === 'analyzing') {
      setElapsedSeconds(0)
      intervalRef.current = setInterval(() => {
        setElapsedSeconds((s) => s + 1)
      }, 1000)
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [pageState.status])

  const handleImageReady = (payload: ImageReadyPayload) => {
    setImageBase64(payload.base64)
    setImageMimeType(payload.mimeType)
    setImagePreview(payload.preview)
    setGpsExifPresent(payload.gpsExifPresent)
    setGpsExif(payload.gpsExif)
    setError(null)
    setPageState({ status: 'idle' })
  }

  const handleClear = () => {
    setImageBase64(null)
    setImageMimeType('image/jpeg')
    setImagePreview(null)
    setGpsExif(undefined)
    setGpsExifPresent(false)
    setError(null)
    setPageState({ status: 'idle' })
  }

  const runAnalysis = async () => {
    if (!imageBase64) {
      setError('Please upload a photo first.')
      return
    }

    setError(null)
    setPageState({ status: 'gating' })

    let gatePass: string | undefined

    try {
      const gateRes = await fetch('/api/image-gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageBase64,
          mimeType: imageMimeType,
          gpsExif: gpsExifPresent ? gpsExif : undefined,
        }),
      })
      const gateData = await gateRes.json()

      // `accepted` honors IMAGE_GATE_FAIL_OPEN — gate_error only proceeds when fail-open is on.
      if (!gateData.accepted) {
        setError(
          gateData.userMessage || {
            title:
              gateData.status === 'gate_error'
                ? 'Gate unavailable'
                : "This doesn't appear to be a suitable real-world photo",
            body:
              gateData.status === 'gate_error'
                ? 'Photo checking is temporarily unavailable. Please try again shortly.'
                : 'Geolocator works best with photographs of real places and their surroundings.',
          }
        )
        setPageState({ status: 'idle' })
        return
      }

      gatePass = typeof gateData.gatePass === 'string' ? gateData.gatePass : undefined
    } catch {
      // Network failure of the gate → fail open; do not block analysis.
    }

    setPageState({ status: 'analyzing' })

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageBase64,
          mimeType: imageMimeType,
          gpsExif: gpsExifPresent ? gpsExif : undefined,
          gatePass,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        if (data.code === 'IMAGE_REJECTED') {
          setPageState({
            status: 'rejected',
            title: data.title || "This doesn't appear to be a suitable real-world photo",
            body: data.error ?? 'This photo is not suitable for analysis.',
          })
          return
        }
        throw new Error(data.error ?? 'Analysis failed')
      }

      setPageState({
        status: 'done',
        locations: data.locations,
        preview: imagePreview,
      })
    } catch (err) {
      setPageState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Analysis failed',
      })
    }
  }

  const busy = pageState.status === 'gating' || pageState.status === 'analyzing'
  const currentStage = getStage(elapsedSeconds)
  const showingResults =
    pageState.status === 'done' ||
    pageState.status === 'analyzing' ||
    pageState.status === 'error' ||
    pageState.status === 'rejected'

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <ScanSearch className="h-5 w-5 text-primary" />
            <span className="font-semibold text-base">GeoLocator</span>
            <Badge variant="outline" className="text-xs hidden sm:inline-flex">
              AI
            </Badge>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10 space-y-8">
        {showingResults ? (
          <>
            {pageState.status === 'analyzing' && (
              <CenteredMessage>
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-base font-medium">{currentStage.message}</p>
                <Progress value={currentStage.progress} className="w-64" />
                <p className="text-sm text-muted-foreground">
                  {elapsedSeconds}s elapsed
                  {elapsedSeconds < 60 && ' · up to 60 seconds'}
                </p>
              </CenteredMessage>
            )}

            {pageState.status === 'done' && (
              <div className="space-y-8">
                <AnalysisResults
                  locations={pageState.locations}
                  imagePreview={pageState.preview}
                />
                <Button
                  variant="outline"
                  className="w-full gap-2 no-print"
                  onClick={handleClear}
                >
                  Analyze another photo
                </Button>
              </div>
            )}

            {pageState.status === 'error' && (
              <CenteredMessage>
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-6 py-4 text-sm text-destructive text-center max-w-sm">
                  <p className="font-medium mb-1">Something went wrong</p>
                  <p>{pageState.message}</p>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" size="sm" onClick={handleClear}>
                    Choose another photo
                  </Button>
                  <Button size="sm" onClick={runAnalysis}>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Retry
                  </Button>
                </div>
              </CenteredMessage>
            )}

            {pageState.status === 'rejected' && (
              <CenteredMessage>
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-6 py-4 text-sm text-destructive text-center max-w-sm">
                  <p className="font-medium mb-1">{pageState.title}</p>
                  <p>{pageState.body}</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleClear}>
                  Choose another photo
                </Button>
              </CenteredMessage>
            )}
          </>
        ) : (
          <>
            <div className="text-center space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
                <Globe className="h-4 w-4" />
                Geospatial Intelligence
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                Where was this photo taken?
              </h1>
              <p className="text-muted-foreground text-base max-w-xl mx-auto">
                Upload any photo and our AI analyst identifies the top 3 most likely locations
                using architecture, vegetation, infrastructure, text, and climate cues.
              </p>
            </div>

            <PhotoUpload
              onImageReady={handleImageReady}
              onClear={handleClear}
              preview={imagePreview}
              disabled={busy}
            />

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                {typeof error === 'string' ? (
                  <p>{error}</p>
                ) : (
                  <>
                    <p className="font-medium mb-1">{error.title}</p>
                    <p>{error.body}</p>
                  </>
                )}
                {imageBase64 ? (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="mt-2 text-sm font-medium underline underline-offset-2"
                  >
                    Choose another photo
                  </button>
                ) : null}
              </div>
            )}

            <Button
              onClick={runAnalysis}
              disabled={!imageBase64 || busy}
              size="lg"
              className="w-full gap-2 text-base"
            >
              {pageState.status === 'gating' ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Checking photo…
                </>
              ) : (
                <>
                  <ScanSearch className="h-5 w-5" />
                  Analyze photo
                </>
              )}
            </Button>

            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { icon: Lock, title: 'Private', desc: 'Images never stored on our servers' },
                { icon: Zap, title: 'Fast results', desc: 'Results in under a minute' },
                {
                  icon: Globe,
                  title: 'Powered by Gemini',
                  desc: 'Google Gemini 3.1 Flash Lite Preview',
                },
              ].map(({ icon: Icon, title, desc }) => (
                <Card key={title} className="bg-muted/30">
                  <CardContent className="p-4 space-y-1">
                    <Icon className="h-5 w-5 mx-auto text-muted-foreground" />
                    <p className="text-xs font-semibold">{title}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </main>

      <footer className="border-t mt-8">
        <div className="max-w-3xl mx-auto px-4 h-12 flex items-center justify-center">
          <a
            href="https://github.com/paulosacramento/Geolocator-Paywall"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            View on GitHub
          </a>
        </div>
      </footer>
    </div>
  )
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      {children}
    </div>
  )
}
