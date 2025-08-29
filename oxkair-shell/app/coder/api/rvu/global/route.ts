import { NextResponse } from 'next/server'
import dataAccessService from '@/lib/coder/data-access-service'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  if (!code) {
    return NextResponse.json({ error: 'code is required' }, { status: 400 })
  }
  const period = await dataAccessService.getGlobalPeriod(code)
  if (!period) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  return NextResponse.json({ code, global_period: period })
}
