/**
 * Client-side GPS EXIF extraction. Must run on the original File/Blob
 * before canvas compression (which strips metadata).
 */
export type ClientGpsExif = {
  latitude: number
  longitude: number
}

export async function extractGpsExif(blob: Blob): Promise<{
  gpsExifPresent: boolean
  gpsExif?: ClientGpsExif
}> {
  try {
    const exifr = await import('exifr')
    const gps = await exifr.gps(blob)
    if (
      !gps ||
      typeof gps.latitude !== 'number' ||
      typeof gps.longitude !== 'number' ||
      !Number.isFinite(gps.latitude) ||
      !Number.isFinite(gps.longitude)
    ) {
      return { gpsExifPresent: false }
    }
    if (
      gps.latitude < -90 ||
      gps.latitude > 90 ||
      gps.longitude < -180 ||
      gps.longitude > 180
    ) {
      return { gpsExifPresent: false }
    }
    return {
      gpsExifPresent: true,
      gpsExif: { latitude: gps.latitude, longitude: gps.longitude },
    }
  } catch {
    return { gpsExifPresent: false }
  }
}
