import { NextResponse } from 'next/server'
import dataAccessService from '@/lib/coder/data-access-service'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const contractor = url.searchParams.get('contractor')
  const locality = url.searchParams.get('locality')
  const modifier = url.searchParams.get('modifier')
  if (!code || !contractor || !locality) {
    return NextResponse.json({ error: 'code, contractor and locality are required' }, { status: 400 })
  }
  const record = await dataAccessService.getCarrierRVU(code, contractor, locality, modifier)
  if (!record) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  return NextResponse.json(record)
}
