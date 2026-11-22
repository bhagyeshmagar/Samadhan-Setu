import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    name: 'Samadhan Setu',
    tagline: 'Bridging Citizens and Government through AI',
    runtime: 'Next.js Node.js (In-Memory Prototype Store)',
    status: 'operational',
  });
}
