import { supabase } from '../lib/supabase'

// Transitional repository for the legacy competitive_techniques table.
// The staged v2 schema lives in competitive_technique_catalog,
// competitive_technique_student_collection, and competitive_technique_proposals.
// We keep this file active until the UI is switched over in a later phase.

const TECHNIQUE_SELECT_FIELDS =
  'id, created_by, reviewed_by, approved_at, status, name, name_fr, topic, topic_fr, subtopic, subtopic_fr, effect_type, effect_type_fr, effect_description, effect_description_fr, worked_example, worked_example_fr, created_at, updated_at'

export async function listOwnCompetitiveTechniques(userId) {
  const { data, error } = await supabase
    .from('competitive_techniques')
    .select(TECHNIQUE_SELECT_FIELDS)
    .eq('created_by', userId)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function listVisibleCompetitiveTechniques(userId) {
  const { data, error } = await supabase
    .from('competitive_techniques')
    .select(TECHNIQUE_SELECT_FIELDS)
    .eq('created_by', userId)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function listApprovedCatalogCompetitiveTechniques() {
  const { data, error } = await supabase
    .from('competitive_techniques')
    .select(TECHNIQUE_SELECT_FIELDS)
    .eq('status', 'approved')
    .order('updated_at', { ascending: false })

  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function listApprovedCompetitiveTechniques(userId) {
  const items = await listPrivateApprovedCompetitiveTechniques(userId)
  const usableItems = []
  const seenLegacyIds = new Set()

  items.forEach((item) => {
    const legacyId = item.legacy_technique_id
    if (!legacyId || seenLegacyIds.has(legacyId)) return

    seenLegacyIds.add(legacyId)
    usableItems.push({
      ...item,
      id: legacyId,
      source_item_id: item.id,
    })
  })

  return usableItems
}

export async function updateOwnCompetitiveTechnique(techniqueId, userId, payload) {
  const { data, error } = await supabase
    .from('competitive_techniques')
    .update(payload)
    .eq('id', techniqueId)
    .eq('created_by', userId)
    .select(TECHNIQUE_SELECT_FIELDS)
    .single()

  if (error) throw error
  return data
}

export async function createCompetitiveTechnique(payload) {
  const { data, error } = await supabase
    .from('competitive_techniques')
    .insert(payload)
    .select(TECHNIQUE_SELECT_FIELDS)
    .single()

  if (error) throw error
  return data
}

export async function deleteOwnCompetitiveTechnique(techniqueId, userId) {
  const { error } = await supabase
    .from('competitive_techniques')
    .delete()
    .eq('id', techniqueId)
    .eq('created_by', userId)

  if (error) throw error
  return true
}

export async function deleteCompetitiveTechniqueAsTeacher(techniqueId) {
  const { error } = await supabase
    .from('competitive_techniques')
    .delete()
    .eq('id', techniqueId)

  if (error) throw error
  return true
}

export async function unpublishCompetitiveTechniqueAsTeacher(techniqueId, teacherUserId) {
  const payload = {
    status: 'rejected',
    reviewed_by: teacherUserId,
    approved_at: null,
  }

  const { data, error } = await supabase
    .from('competitive_techniques')
    .update(payload)
    .eq('id', techniqueId)
    .select(TECHNIQUE_SELECT_FIELDS)
    .single()

  if (error) throw error
  return data
}

const TECHNIQUE_CATALOG_SELECT_FIELDS =
  'id, legacy_technique_id, created_by, reviewed_by, status, published_at, archived_at, name, name_fr, topic, topic_fr, subtopic, subtopic_fr, effect_type, effect_type_fr, effect_description, effect_description_fr, worked_example, worked_example_fr, created_at, updated_at'
const TECHNIQUE_PROPOSAL_SELECT_FIELDS =
  'id, legacy_technique_id, created_by, reviewed_by, published_catalog_id, status, approved_at, name, name_fr, topic, topic_fr, subtopic, subtopic_fr, effect_type, effect_type_fr, effect_description, effect_description_fr, worked_example, worked_example_fr, created_at, updated_at'

function normalizeTechniqueKeyPart(value) {
  return String(value || '').trim().toLowerCase()
}

function buildTechniqueCatalogMatchKey(row) {
  return [
    row?.created_by,
    row?.name,
    row?.topic,
    row?.subtopic,
    row?.effect_type,
    row?.effect_description,
  ]
    .map(normalizeTechniqueKeyPart)
    .join('||')
}

export async function listApprovedTechniqueCatalogEntries() {
  const [{ data: catalogRows, error: catalogError }, { data: proposalRows, error: proposalError }] = await Promise.all([
    supabase
      .from('competitive_technique_catalog')
      .select(TECHNIQUE_CATALOG_SELECT_FIELDS)
      .eq('status', 'approved')
      .order('updated_at', { ascending: false }),
    supabase
      .from('competitive_technique_proposals')
      .select(TECHNIQUE_PROPOSAL_SELECT_FIELDS)
      .eq('status', 'approved')
      .order('updated_at', { ascending: false }),
  ])

  if (catalogError) throw catalogError
  if (proposalError) throw proposalError

  const approvedCatalogRows = Array.isArray(catalogRows) ? catalogRows : []
  const approvedProposalRows = Array.isArray(proposalRows) ? proposalRows : []
  const items = approvedCatalogRows.map((row) => ({
    ...row,
    catalog_id: row.id,
    has_catalog_entry: true,
  }))

  const catalogIds = new Set(approvedCatalogRows.map((row) => row.id).filter(Boolean))
  const legacyIds = new Set(approvedCatalogRows.map((row) => row.legacy_technique_id).filter(Boolean))
  const contentKeys = new Set(approvedCatalogRows.map((row) => buildTechniqueCatalogMatchKey(row)).filter(Boolean))

  approvedProposalRows.forEach((row) => {
    const hasCatalogMatch =
      (row.published_catalog_id && catalogIds.has(row.published_catalog_id)) ||
      (row.legacy_technique_id && legacyIds.has(row.legacy_technique_id)) ||
      contentKeys.has(buildTechniqueCatalogMatchKey(row))

    if (hasCatalogMatch) return

    items.push({
      id: `proposal:${row.id}`,
      catalog_id: null,
      has_catalog_entry: false,
      legacy_technique_id: row.legacy_technique_id,
      created_by: row.created_by,
      reviewed_by: row.reviewed_by,
      status: 'approved',
      published_at: row.approved_at,
      archived_at: null,
      name: row.name,
      name_fr: row.name_fr,
      topic: row.topic,
      topic_fr: row.topic_fr,
      subtopic: row.subtopic,
      subtopic_fr: row.subtopic_fr,
      effect_type: row.effect_type,
      effect_type_fr: row.effect_type_fr,
      effect_description: row.effect_description,
      effect_description_fr: row.effect_description_fr,
      worked_example: row.worked_example,
      worked_example_fr: row.worked_example_fr,
      created_at: row.created_at,
      updated_at: row.updated_at,
      orphaned_proposal_id: row.id,
    })
  })

  items.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
  return items
}

export async function listGlobalCompetitiveTechniqueCatalog() {
  return listApprovedTechniqueCatalogEntries()
}

export async function deleteTechniqueCatalogEntryAsTeacher(catalogTechniqueId) {
  const { error } = await supabase
    .from('competitive_technique_catalog')
    .delete()
    .eq('id', catalogTechniqueId)

  if (error) throw error
  return true
}

export async function removeCompetitiveTechniqueFromGlobalCatalogAsTeacher({
  catalogId,
  orphanedProposalId,
  legacyTechniqueId,
  teacherUserId,
}) {
  const proposalIds = new Set()

  if (orphanedProposalId) {
    proposalIds.add(orphanedProposalId)
  }

  const matchers = []
  if (catalogId) matchers.push(`published_catalog_id.eq.${catalogId}`)
  if (legacyTechniqueId) matchers.push(`legacy_technique_id.eq.${legacyTechniqueId}`)

  if (matchers.length) {
    const { data, error } = await supabase
      .from('competitive_technique_proposals')
      .select('id')
      .eq('status', 'approved')
      .or(matchers.join(','))

    if (error) throw error
    ;(Array.isArray(data) ? data : []).forEach((row) => {
      if (row?.id) proposalIds.add(row.id)
    })
  }

  if (proposalIds.size) {
    const { error } = await supabase
      .from('competitive_technique_proposals')
      .delete()
      .in('id', [...proposalIds])

    if (error) throw error
  }

  if (catalogId) {
    await deleteTechniqueCatalogEntryAsTeacher(catalogId)
  }

  if (legacyTechniqueId && teacherUserId) {
    await unpublishCompetitiveTechniqueAsTeacher(legacyTechniqueId, teacherUserId)
  }

  return true
}

export async function archiveTechniqueCatalogEntryAsTeacher(catalogTechniqueId) {
  const { data, error } = await supabase
    .from('competitive_technique_catalog')
    .update({
      status: 'archived',
      archived_at: new Date().toISOString(),
    })
    .eq('id', catalogTechniqueId)
    .select(TECHNIQUE_CATALOG_SELECT_FIELDS)
    .single()

  if (error) throw error
  return data
}

export async function updateTechniqueCatalogEntryAsTeacher(catalogTechniqueId, payload) {
  const { data, error } = await supabase
    .from('competitive_technique_catalog')
    .update(payload)
    .eq('id', catalogTechniqueId)
    .select(TECHNIQUE_CATALOG_SELECT_FIELDS)
    .single()

  if (error) throw error
  return data
}

export async function addTechniqueCatalogEntryToStudentCollection(studentUserId, catalogTechniqueId, source = 'copied') {
  const { data, error } = await supabase
    .from('competitive_technique_student_collection')
    .insert({
      student_user_id: studentUserId,
      catalog_technique_id: catalogTechniqueId,
      source,
    })
    .select('id, student_user_id, catalog_technique_id, source, created_at')
    .single()

  if (error) throw error
  return data
}

export async function listStudentTechniqueCollectionEntries(studentUserId) {
  const { data: collectionRows, error: collectionError } = await supabase
    .from('competitive_technique_student_collection')
    .select('id, student_user_id, catalog_technique_id, source, created_at')
    .eq('student_user_id', studentUserId)
    .order('created_at', { ascending: false })

  if (collectionError) throw collectionError

  const rows = Array.isArray(collectionRows) ? collectionRows : []
  const catalogIds = [...new Set(rows.map((row) => row.catalog_technique_id).filter(Boolean))]
  if (!catalogIds.length) return []

  const { data: catalogRows, error: catalogError } = await supabase
    .from('competitive_technique_catalog')
    .select(TECHNIQUE_CATALOG_SELECT_FIELDS)
    .in('id', catalogIds)

  if (catalogError) throw catalogError

  const catalogById = (Array.isArray(catalogRows) ? catalogRows : []).reduce((acc, row) => {
    acc[row.id] = row
    return acc
  }, {})

  return rows
    .map((row) => {
      const catalog = catalogById[row.catalog_technique_id]
      if (!catalog) return null

      return {
        ...catalog,
        collection_entry_id: row.id,
        collection_source: row.source,
        collected_at: row.created_at,
      }
    })
    .filter(Boolean)
}

export async function listPrivateApprovedCompetitiveTechniques(userId) {
  const [collectionRows, proposalRows] = await Promise.all([
    listStudentTechniqueCollectionEntries(userId),
    supabase
      .from('competitive_technique_proposals')
      .select(TECHNIQUE_PROPOSAL_SELECT_FIELDS)
      .eq('created_by', userId)
      .eq('status', 'approved')
      .order('updated_at', { ascending: false }),
  ])

  const { data: approvedProposalRows, error: proposalsError } = proposalRows
  if (proposalsError) throw proposalsError

  const items = []
  const seenKeys = new Set()

  const pushUnique = (key, value) => {
    if (!key || seenKeys.has(key)) return
    seenKeys.add(key)
    items.push(value)
  }

  collectionRows.forEach((row) => {
    const sourceKey = row.id || row.source_catalog_id || row.legacy_technique_id
    pushUnique(`catalog:${sourceKey}`, {
      ...row,
      scope: 'private_collection',
      is_owner_copy: row.created_by === userId,
    })
  })

  ;(Array.isArray(approvedProposalRows) ? approvedProposalRows : []).forEach((row) => {
    const sourceKey = row.published_catalog_id || row.legacy_technique_id || row.id
    pushUnique(`catalog:${sourceKey}`, {
      ...row,
      scope: 'private_collection',
      collection_source: row.published_catalog_id ? 'published_proposal' : 'approved_proposal',
      collected_at: row.approved_at || row.updated_at || row.created_at,
      is_owner_copy: true,
    })
  })

  items.sort((a, b) => String(b.collected_at || b.updated_at || '').localeCompare(String(a.collected_at || a.updated_at || '')))
  return items
}

export async function listPrivateCompetitiveTechniqueInventory(userId) {
  return listPrivateApprovedCompetitiveTechniques(userId)
}

export async function listProposedCompetitiveTechniques() {
  const { data, error } = await supabase
    .from('competitive_technique_proposals')
    .select(TECHNIQUE_PROPOSAL_SELECT_FIELDS)
    .eq('status', 'proposed')
    .order('updated_at', { ascending: false })

  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function listOwnCompetitiveTechniqueProposals(userId) {
  const { data, error } = await supabase
    .from('competitive_technique_proposals')
    .select(TECHNIQUE_PROPOSAL_SELECT_FIELDS)
    .eq('created_by', userId)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function listEditableCompetitiveTechniqueProposals(userId) {
  return listOwnCompetitiveTechniqueProposals(userId)
}

export async function createCompetitiveTechniqueProposal(payload) {
  const { data, error } = await supabase
    .from('competitive_technique_proposals')
    .insert(payload)
    .select(TECHNIQUE_PROPOSAL_SELECT_FIELDS)
    .single()

  if (error) throw error
  if (data?.status === 'approved' && data?.reviewed_by) {
    return publishCompetitiveTechniqueProposalRecord(data, data.reviewed_by)
  }

  return data
}

export async function updateOwnCompetitiveTechniqueProposal(proposalId, userId, payload) {
  const { data, error } = await supabase
    .from('competitive_technique_proposals')
    .update(payload)
    .eq('id', proposalId)
    .eq('created_by', userId)
    .select(TECHNIQUE_PROPOSAL_SELECT_FIELDS)
    .single()

  if (error) throw error
  if (data?.status === 'approved' && data?.reviewed_by) {
    return publishCompetitiveTechniqueProposalRecord(data, data.reviewed_by)
  }

  return data
}

export async function deleteOwnCompetitiveTechniqueProposal(proposalId, userId) {
  const { error } = await supabase
    .from('competitive_technique_proposals')
    .delete()
    .eq('id', proposalId)
    .eq('created_by', userId)

  if (error) throw error
  return true
}

async function publishCompetitiveTechniqueProposalRecord(proposal, teacherUserId) {
  const nowIso = new Date().toISOString()
  let catalogId = proposal.published_catalog_id || null
  let legacyTechniqueId = proposal.legacy_technique_id || null

  if (legacyTechniqueId) {
    const { error: legacyUpdateError } = await supabase
      .from('competitive_techniques')
      .update({
        created_by: proposal.created_by,
        reviewed_by: teacherUserId,
        approved_at: nowIso,
        status: 'approved',
        name: proposal.name,
        name_fr: proposal.name_fr,
        topic: proposal.topic,
        topic_fr: proposal.topic_fr,
        subtopic: proposal.subtopic,
        subtopic_fr: proposal.subtopic_fr,
        effect_type: proposal.effect_type,
        effect_type_fr: proposal.effect_type_fr,
        effect_description: proposal.effect_description,
        effect_description_fr: proposal.effect_description_fr,
        worked_example: proposal.worked_example,
        worked_example_fr: proposal.worked_example_fr,
      })
      .eq('id', legacyTechniqueId)

    if (legacyUpdateError) throw legacyUpdateError
  } else {
    const { data: legacyRow, error: legacyInsertError } = await supabase
      .from('competitive_techniques')
      .insert({
        created_by: proposal.created_by,
        reviewed_by: teacherUserId,
        approved_at: nowIso,
        status: 'approved',
        name: proposal.name,
        name_fr: proposal.name_fr,
        topic: proposal.topic,
        topic_fr: proposal.topic_fr,
        subtopic: proposal.subtopic,
        subtopic_fr: proposal.subtopic_fr,
        effect_type: proposal.effect_type,
        effect_type_fr: proposal.effect_type_fr,
        effect_description: proposal.effect_description,
        effect_description_fr: proposal.effect_description_fr,
        worked_example: proposal.worked_example,
        worked_example_fr: proposal.worked_example_fr,
      })
      .select('id')
      .single()

    if (legacyInsertError) throw legacyInsertError
    legacyTechniqueId = legacyRow.id
  }

  if (catalogId) {
    const { error: catalogUpdateError } = await supabase
      .from('competitive_technique_catalog')
      .update({
        legacy_technique_id: legacyTechniqueId,
        reviewed_by: teacherUserId,
        status: 'approved',
        archived_at: null,
        published_at: nowIso,
        name: proposal.name,
        name_fr: proposal.name_fr,
        topic: proposal.topic,
        topic_fr: proposal.topic_fr,
        subtopic: proposal.subtopic,
        subtopic_fr: proposal.subtopic_fr,
        effect_type: proposal.effect_type,
        effect_type_fr: proposal.effect_type_fr,
        effect_description: proposal.effect_description,
        effect_description_fr: proposal.effect_description_fr,
        worked_example: proposal.worked_example,
        worked_example_fr: proposal.worked_example_fr,
      })
      .eq('id', catalogId)

    if (catalogUpdateError) throw catalogUpdateError
  } else {
    const { data: catalogRow, error: catalogInsertError } = await supabase
      .from('competitive_technique_catalog')
      .insert({
        legacy_technique_id: legacyTechniqueId,
        created_by: proposal.created_by,
        reviewed_by: teacherUserId,
        status: 'approved',
        published_at: nowIso,
        name: proposal.name,
        name_fr: proposal.name_fr,
        topic: proposal.topic,
        topic_fr: proposal.topic_fr,
        subtopic: proposal.subtopic,
        subtopic_fr: proposal.subtopic_fr,
        effect_type: proposal.effect_type,
        effect_type_fr: proposal.effect_type_fr,
        effect_description: proposal.effect_description,
        effect_description_fr: proposal.effect_description_fr,
        worked_example: proposal.worked_example,
        worked_example_fr: proposal.worked_example_fr,
        created_at: proposal.created_at,
        updated_at: proposal.updated_at,
      })
      .select('id')
      .single()

    if (catalogInsertError) throw catalogInsertError
    catalogId = catalogRow.id
  }

  const { data, error } = await supabase
    .from('competitive_technique_proposals')
    .update({
      legacy_technique_id: legacyTechniqueId,
      status: 'approved',
      reviewed_by: teacherUserId,
      approved_at: nowIso,
      published_catalog_id: catalogId,
    })
    .eq('id', proposal.id)
    .select(TECHNIQUE_PROPOSAL_SELECT_FIELDS)
    .single()

  if (error) throw error

  try {
    await addTechniqueCatalogEntryToStudentCollection(proposal.created_by, catalogId, 'seeded_from_legacy_approved')
  } catch (collectionError) {
    const isDuplicate = collectionError?.code === '23505' || /duplicate key/i.test(String(collectionError?.message || ''))
    if (!isDuplicate) throw collectionError
  }

  return data
}

export async function reviewProposedCompetitiveTechnique(proposalId, teacherUserId, decision) {
  const { data: proposal, error: proposalError } = await supabase
    .from('competitive_technique_proposals')
    .select(TECHNIQUE_PROPOSAL_SELECT_FIELDS)
    .eq('id', proposalId)
    .eq('status', 'proposed')
    .single()

  if (proposalError) throw proposalError

  if (decision !== 'approve') {
    const { data, error } = await supabase
      .from('competitive_technique_proposals')
      .update({
        status: 'rejected',
        reviewed_by: teacherUserId,
        approved_at: null,
      })
      .eq('id', proposalId)
      .select(TECHNIQUE_PROPOSAL_SELECT_FIELDS)
      .single()

    if (error) throw error
    return data
  }

  return publishCompetitiveTechniqueProposalRecord(proposal, teacherUserId)
}

export { TECHNIQUE_PROPOSAL_SELECT_FIELDS, TECHNIQUE_SELECT_FIELDS }
