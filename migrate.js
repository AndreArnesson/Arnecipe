// Migration script
// Run with: $env:SERVICE_ROLE="your-key"; node migrate.js

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const SUPABASE_URL = 'https://guonvkorystzpzypbtmy.supabase.co'
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE

if (!SERVICE_ROLE_KEY) {
  console.error('Missing SERVICE_ROLE env var.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const DIR = resolve('json_migrate')

function parseJsonAggCsv(filename) {
  const raw = readFileSync(`${DIR}/${filename}`, 'utf8')
  const lines = raw.split('\n').filter(l => l.trim())
  const dataLine = lines[1]
  if (!dataLine) return []
  const json = dataLine.trim().replace(/^"|"$/g, '').replace(/""/g, '"')
  return JSON.parse(json) ?? []
}

function parseAuthUsersCsv(filename) {
  const raw = readFileSync(`${DIR}/${filename}`, 'utf8')
  const lines = raw.split('\n').filter(l => l.trim())
  return lines.slice(1).map(line => {
    const idx1 = line.indexOf(';')
    const idx2 = line.indexOf(';', idx1 + 1)
    const idx3 = line.indexOf(';', idx2 + 1)
    const email = line.slice(idx1 + 1, idx2).trim()
    const id = line.slice(idx2 + 1, idx3).trim()
    const rawMeta = line.slice(idx3 + 1).trim()
    let raw_user_meta_data = {}
    try { raw_user_meta_data = JSON.parse(rawMeta.replace(/^"|"$/g, '').replace(/""/g, '"')) } catch {}
    return { id, email, raw_user_meta_data }
  })
}

// Replace every occurrence of old UUIDs with new UUIDs throughout a data structure
function remapIds(data, idMap) {
  const str = JSON.stringify(data)
  const remapped = str.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, match => idMap.get(match) ?? match)
  return JSON.parse(remapped)
}

const TABLE_FILES = [
  ['profiles',      'query-results-export-2026-05-02_10-44-19.csv', 'json_agg'],
  ['groups',        null, null], // no export = empty, will be created via group_members data
  ['group_members', 'query-results-export-2026-05-02_10-44-03.csv', 'json_agg'],
  ['group_invites', 'query-results-export-2026-05-02_10-44-12.csv', 'json_agg'],
  ['recipes',       'query-results-export-2026-05-02_10-42-16.csv', 'json_agg'],
  ['recipe_images', 'query-results-export-2026-05-02_10-43-14.csv', 'json_agg'],
  ['recipe_comments','query-results-export-2026-05-02_10-43-26.csv','json_agg'],
  ['recipe_ratings','query-results-export-2026-05-02_10-43-35.csv', 'json_agg'],
]

async function migrate() {
  // Step 1: Parse original auth users (with their original UUIDs)
  const originalUsers = parseAuthUsersCsv('query-results-export-2026-05-02_10-45-09.csv')
  console.log(`Found ${originalUsers.length} users in export`)

  // Step 2: Ensure all users exist in the new project
  console.log('\nEnsuring auth users exist...')
  for (const user of originalUsers) {
    const { error } = await supabase.auth.admin.createUser({
      email: user.email,
      email_confirm: true,
      user_metadata: user.raw_user_meta_data ?? {},
    })
    if (error && !error.message.toLowerCase().includes('already')) {
      console.error(`  ✗ ${user.email}: ${error.message}`)
    }
  }

  // Step 3: List actual users in new project and build old→new UUID map by email
  console.log('\nBuilding UUID mapping...')
  const { data: { users: newUsers }, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (listErr) { console.error('Failed to list users:', listErr.message); process.exit(1) }

  const emailToNewId = new Map(newUsers.map(u => [u.email, u.id]))
  const idMap = new Map()
  for (const orig of originalUsers) {
    const newId = emailToNewId.get(orig.email)
    if (!newId) { console.warn(`  ⚠ No new user found for ${orig.email}`); continue }
    idMap.set(orig.id, newId)
    const changed = orig.id !== newId ? ` → ${newId}` : ' (same)'
    console.log(`  ${orig.email}${changed}`)
  }

  // Step 4: Import tables, remapping all UUIDs
  console.log('\nImporting tables...')
  for (const [table, file] of TABLE_FILES) {
    if (table === 'groups') {
      // groups wasn't exported — reconstruct from group_members data
      const membersRaw = parseJsonAggCsv('query-results-export-2026-05-02_10-44-03.csv')
      const membersRemapped = remapIds(membersRaw, idMap)
      const uniqueGroupIds = [...new Set(membersRemapped.map(m => m.group_id))]
      const groupRows = uniqueGroupIds.map(gid => ({
        id: gid,
        name: 'Family',
        created_by: membersRemapped.find(m => m.role === 'owner' && m.group_id === gid)?.user_id
          ?? membersRemapped.find(m => m.group_id === gid)?.user_id,
      }))
      const { error } = await supabase.from('groups').upsert(groupRows, { onConflict: 'id' })
      if (error) console.error(`  ✗ groups: ${error.message}`)
      else console.log(`  ✓ groups: ${groupRows.length} reconstructed`)
      continue
    }

    if (!file) { console.log(`  — ${table}: skipped`); continue }
    const rows = parseJsonAggCsv(file)
    if (!rows.length) { console.log(`  — ${table}: empty`); continue }

    const remapped = remapIds(rows, idMap)
    const { error } = await supabase.from(table).upsert(remapped, { onConflict: 'id' })
    if (error) {
      console.error(`  ✗ ${table} (${rows.length} rows): ${error.message}`)
    } else {
      console.log(`  ✓ ${table}: ${rows.length} rows`)
    }
  }

  console.log('\nDone!')
}

migrate().catch(console.error)
