import { NextResponse } from 'next/server'
import dataAccessService from '@/lib/coder/data-access-service'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const loc = url.searchParams.get('locality')
  if (!loc) {
    return NextResponse.json({ error: 'locality is required' }, { status: 400 })
  }
  const record = await dataAccessService.getGPCI(loc)
  if (!record) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  return NextResponse.json(record)
}
