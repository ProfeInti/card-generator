import { supabase } from '../lib/supabase'

export async function listProfileUsernamesByIds(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))]
  if (!ids.length) return {}

  let rows = null

  // Preferred path: security-definer RPC that can bypass profile RLS for teacher review.
  const rpc = await supabase.rpc('list_profile_usernames_by_ids', { p_user_ids: ids })
  if (!rpc.error && Array.isArray(rpc.data)) {
    rows = rpc.data
  } else {
    // Fallback path for environments where direct profiles select is already allowed.
    const direct = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', ids)

    if (direct.error) throw direct.error
    rows = Array.isArray(direct.data) ? direct.data : []
  }

  return rows.reduce((acc, row) => {
    acc[row.id] = String(row.username || '').trim() || row.id
    return acc
  }, {})
}
