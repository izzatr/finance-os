/**
 * Better Auth HTTP handler for Finance OS
 *
 * Mounted at /auth/* on the main Hono app via app.route('/auth', authApp)
 * Uses strict: false so that Better Auth sees the FULL path (including /auth prefix).
 */
import { Hono } from 'hono'
import { auth } from '@finance-os/db'

const authApp = new Hono({ strict: false })

// Handle all auth endpoints — Better Auth expects /auth/sign-in, /auth/sign-up, etc.
authApp.on(['POST', 'GET'], '/**', (c) => auth.handler(c.req.raw))

export default authApp
