// Image migration script
// Downloads images from old Lovable bucket and re-uploads to new Supabase bucket
// Run with: $env:SERVICE_ROLE="your-key"; node migrate-images.js

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const OLD_URL_HOST = 'bxcxvocaupmwiudcvexo.supabase.co'
const SUPABASE_URL = 'https://guonvkorystzpzypbtmy.supabase.co'
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE
const BUCKET = 'recipe-images'
const DIR = resolve('json_migrate')

// Parse auth CSV to build new→old UUID reverse map
function buildReverseIdMap() {
  const raw = readFileSync(`${DIR}/query-results-export-2026-05-02_10-45-09.csv`, 'utf8')
  const lines = raw.split('\n').filter(l => l.trim()).slice(1)
  const oldIds = lines.map(line => {
    const idx1 = line.indexOf(';'), idx2 = line.indexOf(';', idx1 + 1), idx3 = line.indexOf(';', idx2 + 1)
    return { email: line.slice(idx1 + 1, idx2).trim(), oldId: line.slice(idx2 + 1, idx3).trim() }
  })
  return oldIds // we'll match against new users below
}

if (!SERVICE_ROLE_KEY) {
  console.error('Missing SERVICE_ROLE env var.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function extractPath(url) {
  // Extract path after /recipe-images/
  const match = url.match(/\/recipe-images\/(.+)$/)
  return match ? match[1] : null
}

async function downloadAndUpload(oldUrl, storagePath) {
  const res = await fetch(oldUrl)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${oldUrl}`)
  const buffer = await res.arrayBuffer()
  const contentType = res.headers.get('content-type') ?? 'image/jpeg'

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType, upsert: true })
  if (error) throw new Error(error.message)

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
  return data.publicUrl
}

async function migrateImages() {
  // Build reverse UUID map: newId → oldId (for users whose UUID changed)
  const oldUsers = buildReverseIdMap()
  const { data: { users: newUsers } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const newIdToOldId = new Map()
  for (const { email, oldId } of oldUsers) {
    const newUser = newUsers.find(u => u.email === email)
    if (newUser && newUser.id !== oldId) newIdToOldId.set(newUser.id, oldId)
  }

  function toOldStorageUrl(url) {
    // Replace any remapped UUIDs in the URL path back to the original UUID
    return url.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      match => newIdToOldId.get(match) ?? match)
  }

  // Collect all old image URLs from both tables
  const { data: recipes } = await supabase.from('recipes').select('id, image_url').not('image_url', 'is', null)
  const { data: recipeImages } = await supabase.from('recipe_images').select('id, image_url')

  const toMigrate = []
  for (const r of recipes ?? []) {
    if (r.image_url?.includes(OLD_URL_HOST)) toMigrate.push({ table: 'recipes', id: r.id, url: r.image_url })
  }
  for (const r of recipeImages ?? []) {
    if (r.image_url?.includes(OLD_URL_HOST)) toMigrate.push({ table: 'recipe_images', id: r.id, url: r.image_url })
  }

  if (!toMigrate.length) {
    console.log('No old image URLs found — nothing to migrate.')
    return
  }

  console.log(`Found ${toMigrate.length} images to migrate\n`)

  for (const item of toMigrate) {
    const storagePath = extractPath(item.url)
    if (!storagePath) { console.warn(`  ⚠ Could not parse path from: ${item.url}`); continue }

    try {
      const downloadUrl = toOldStorageUrl(item.url)
      const newUrl = await downloadAndUpload(downloadUrl, storagePath)

      const { error } = await supabase
        .from(item.table)
        .update({ image_url: newUrl })
        .eq('id', item.id)
      if (error) throw new Error(error.message)

      console.log(`  ✓ ${item.table} ${item.id.slice(0, 8)}… → ${storagePath}`)
    } catch (err) {
      console.error(`  ✗ ${item.table} ${item.id.slice(0, 8)}…: ${err.message}`)
    }
  }

  console.log('\nImage migration complete!')
}

migrateImages().catch(console.error)
