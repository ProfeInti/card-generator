import { getAppAccessToken } from '../lib/authClient'

const competitiveTechniquesApiBaseUrl = String(import.meta.env.VITE_API_URL || '/api').trim().replace(/\/$/, '')

export const TECHNIQUE_SELECT_FIELDS =
  'id, created_by, reviewed_by, approved_at, status, name, name_fr, topic, topic_fr, subtopic, subtopic_fr, effect_type, effect_type_fr, effect_description, effect_description_fr, worked_example, worked_example_fr, application_structure, application_structure_fr, sympy_transformation, sympy_transformation_es, sympy_transformation_fr, sympy_input_schema, structured_technique_spec, created_at, updated_at'

export const TECHNIQUE_PROPOSAL_SELECT_FIELDS =
  'id, legacy_technique_id, created_by, reviewed_by, published_catalog_id, status, approved_at, name, name_fr, topic, topic_fr, subtopic, subtopic_fr, effect_type, effect_type_fr, effect_description, effect_description_fr, worked_example, worked_example_fr, application_structure, application_structure_fr, sympy_transformation, sympy_transformation_es, sympy_transformation_fr, sympy_input_schema, structured_technique_spec, created_at, updated_at'

async function requestCompetitiveTechniquesApi(pathname, options = {}, fallbackMessage = 'Request failed.') {
  const accessToken = await getAppAccessToken()
  if (!accessToken) {
    throw new Error('No active local or Supabase session was found.')
  }

  const response = await fetch(`${competitiveTechniquesApiBaseUrl}${pathname}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  if (response.status === 204) {
    return {}
  }

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(body?.error || fallbackMessage)
  }

  return body
}

function normalizeTechniqueRow(row) {
  if (!row || typeof row !== 'object') return null
  return {
    ...row,
    structured_technique_spec:
      row.structured_technique_spec && typeof row.structured_technique_spec === 'object'
        ? row.structured_technique_spec
        : null,
  }
}

function normalizeTechniqueRows(rows) {
  return (Array.isArray(rows) ? rows : []).map(normalizeTechniqueRow).filter(Boolean)
}

export async function listOwnCompetitiveTechniques(_userId) {
  return listOwnCompetitiveTechniqueProposals()
}

export async function listVisibleCompetitiveTechniques(_userId) {
  return listOwnCompetitiveTechniqueProposals()
}

export async function listApprovedCatalogCompetitiveTechniques() {
  return listApprovedTechniqueCatalogEntries()
}

export async function listApprovedCompetitiveTechniques(_userId) {
  const items = await listPrivateApprovedCompetitiveTechniques()
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

export async function updateOwnCompetitiveTechnique(techniqueId, _userId, payload) {
  return updateOwnCompetitiveTechniqueProposal(techniqueId, '', payload)
}

export async function createCompetitiveTechnique(payload) {
  return createCompetitiveTechniqueProposal(payload)
}

export async function deleteOwnCompetitiveTechnique(techniqueId, _userId) {
  return deleteOwnCompetitiveTechniqueProposal(techniqueId)
}

export async function deleteCompetitiveTechniqueAsTeacher(techniqueId) {
  await requestCompetitiveTechniquesApi(
    '/competitive-techniques/catalog/remove-global',
    {
      method: 'POST',
      body: {
        legacyTechniqueId: techniqueId,
      },
    },
    'Could not delete the approved technique.',
  )

  return true
}

export async function unpublishCompetitiveTechniqueAsTeacher(techniqueId, teacherUserId) {
  await requestCompetitiveTechniquesApi(
    '/competitive-techniques/catalog/remove-global',
    {
      method: 'POST',
      body: {
        legacyTechniqueId: techniqueId,
        teacherUserId,
      },
    },
    'Could not unpublish the approved technique.',
  )

  return true
}

export async function listApprovedTechniqueCatalogEntries() {
  const body = await requestCompetitiveTechniquesApi(
    '/competitive-techniques/catalog',
    {},
    'Could not load the approved techniques catalog.',
  )

  return normalizeTechniqueRows(body?.items)
}

export async function listGlobalCompetitiveTechniqueCatalog() {
  return listApprovedTechniqueCatalogEntries()
}

export async function deleteTechniqueCatalogEntryAsTeacher(catalogTechniqueId) {
  await requestCompetitiveTechniquesApi(
    `/competitive-techniques/catalog/${encodeURIComponent(String(catalogTechniqueId || '').trim())}`,
    {
      method: 'DELETE',
    },
    'Could not delete the approved technique from the global catalog.',
  )

  return true
}

export async function removeCompetitiveTechniqueFromGlobalCatalogAsTeacher({
  catalogId,
  orphanedProposalId,
  legacyTechniqueId,
  teacherUserId,
}) {
  await requestCompetitiveTechniquesApi(
    '/competitive-techniques/catalog/remove-global',
    {
      method: 'POST',
      body: {
        catalogId,
        orphanedProposalId,
        legacyTechniqueId,
        teacherUserId,
      },
    },
    'Could not remove the approved technique from the global catalog.',
  )

  return true
}

export async function archiveTechniqueCatalogEntryAsTeacher(catalogTechniqueId) {
  const body = await requestCompetitiveTechniquesApi(
    `/competitive-techniques/catalog/${encodeURIComponent(String(catalogTechniqueId || '').trim())}/archive`,
    {
      method: 'PATCH',
    },
    'Could not archive the approved technique.',
  )

  return normalizeTechniqueRow(body?.item)
}

export async function updateTechniqueCatalogEntryAsTeacher(catalogTechniqueId, payload) {
  const body = await requestCompetitiveTechniquesApi(
    `/competitive-techniques/catalog/${encodeURIComponent(String(catalogTechniqueId || '').trim())}`,
    {
      method: 'PATCH',
      body: payload,
    },
    'Could not update the approved technique.',
  )

  return normalizeTechniqueRow(body?.item)
}

export async function addTechniqueCatalogEntryToStudentCollection(_studentUserId, catalogTechniqueId, source = 'copied') {
  const body = await requestCompetitiveTechniquesApi(
    `/competitive-techniques/catalog/${encodeURIComponent(String(catalogTechniqueId || '').trim())}/collect`,
    {
      method: 'POST',
      body: { source },
    },
    'Could not add the technique to the private collection.',
  )

  return normalizeTechniqueRow(body?.item)
}

export async function listStudentTechniqueCollectionEntries(_studentUserId) {
  const body = await requestCompetitiveTechniquesApi(
    '/competitive-techniques/collection',
    {},
    'Could not load the private techniques collection.',
  )

  return normalizeTechniqueRows(body?.items)
}

export async function listPrivateApprovedCompetitiveTechniques(_userId) {
  const body = await requestCompetitiveTechniquesApi(
    '/competitive-techniques/private-inventory',
    {},
    'Could not load the private techniques inventory.',
  )

  return normalizeTechniqueRows(body?.items)
}

export async function listPrivateCompetitiveTechniqueInventory(_userId) {
  return listPrivateApprovedCompetitiveTechniques()
}

export async function listProposedCompetitiveTechniques() {
  const body = await requestCompetitiveTechniquesApi(
    '/competitive-techniques/proposals/review',
    {},
    'Could not load proposed techniques.',
  )

  return normalizeTechniqueRows(body?.items)
}

export async function listOwnCompetitiveTechniqueProposals(_userId) {
  const body = await requestCompetitiveTechniquesApi(
    '/competitive-techniques/proposals/mine',
    {},
    'Could not load competitive technique proposals.',
  )

  return normalizeTechniqueRows(body?.items)
}

export async function listEditableCompetitiveTechniqueProposals(_userId) {
  return listOwnCompetitiveTechniqueProposals()
}

export async function createCompetitiveTechniqueProposal(payload) {
  const body = await requestCompetitiveTechniquesApi(
    '/competitive-techniques/proposals',
    {
      method: 'POST',
      body: payload,
    },
    'Could not create the competitive technique proposal.',
  )

  return normalizeTechniqueRow(body?.item)
}

export async function updateOwnCompetitiveTechniqueProposal(proposalId, _userId, payload) {
  const body = await requestCompetitiveTechniquesApi(
    `/competitive-techniques/proposals/${encodeURIComponent(String(proposalId || '').trim())}`,
    {
      method: 'PATCH',
      body: payload,
    },
    'Could not update the competitive technique proposal.',
  )

  return normalizeTechniqueRow(body?.item)
}

export async function deleteOwnCompetitiveTechniqueProposal(proposalId, _userId) {
  await requestCompetitiveTechniquesApi(
    `/competitive-techniques/proposals/${encodeURIComponent(String(proposalId || '').trim())}`,
    {
      method: 'DELETE',
    },
    'Could not delete the competitive technique proposal.',
  )

  return true
}

export async function reviewProposedCompetitiveTechnique(proposalId, _teacherUserId, decision) {
  const body = await requestCompetitiveTechniquesApi(
    `/competitive-techniques/proposals/${encodeURIComponent(String(proposalId || '').trim())}/review`,
    {
      method: 'POST',
      body: { decision },
    },
    'Could not apply the review decision.',
  )

  return normalizeTechniqueRow(body?.item)
}
