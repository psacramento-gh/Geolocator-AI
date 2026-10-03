import { jwtVerify } from 'jose'

export const ADMIN_COOKIE = 'geolocator_admin_session'

export async function verifyAdminSessionToken(token: string): Promise<boolean> {
  try {
    const secret = process.env.ADMIN_SECRET
    if (!secret) return false
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret))
    return payload.role === 'admin'
  } catch {
    return false
  }
}
