const PENDING_ID = 'pending_normalization'

export const TECHNIQUE_TOPIC_OPTIONS = [
  {
    id: 'arithmetic',
    labelEs: 'Aritmética',
    labelFr: 'Arithmétique',
    subtopics: [
      { id: 'arithmetic_numbers_operations', labelEs: 'Números y operaciones', labelFr: 'Nombres et opérations' },
      { id: 'arithmetic_fractions_decimals', labelEs: 'Fracciones y decimales', labelFr: 'Fractions et décimaux' },
      { id: 'arithmetic_percentages', labelEs: 'Porcentajes', labelFr: 'Pourcentages' },
      { id: 'arithmetic_ratios_proportions', labelEs: 'Razones y proporciones', labelFr: 'Rapports et proportions' },
      { id: 'arithmetic_quantities_units', labelEs: 'Magnitudes y unidades', labelFr: 'Grandeurs et unités' },
      { id: 'arithmetic_divisibility', labelEs: 'Divisibilidad', labelFr: 'Divisibilité' },
      { id: 'arithmetic_powers', labelEs: 'Potencias', labelFr: 'Puissances' },
      { id: 'arithmetic_roots', labelEs: 'Raíces', labelFr: 'Racines' },
    ],
  },
  {
    id: 'algebra',
    labelEs: 'Álgebra',
    labelFr: 'Algèbre',
    subtopics: [
      { id: 'algebra_expressions', labelEs: 'Expresiones algebraicas', labelFr: 'Expressions algébriques' },
      { id: 'algebra_operations', labelEs: 'Operaciones algebraicas', labelFr: 'Opérations algébriques' },
      { id: 'algebra_notable_products', labelEs: 'Productos notables', labelFr: 'Produits remarquables' },
      { id: 'algebra_factorization', labelEs: 'Factorización', labelFr: 'Factorisation' },
      { id: 'algebra_rational_fractions', labelEs: 'Fracciones algebraicas', labelFr: 'Fractions algébriques' },
      { id: 'algebra_equations', labelEs: 'Ecuaciones', labelFr: 'Équations' },
      { id: 'algebra_inequalities', labelEs: 'Inecuaciones', labelFr: 'Inéquations' },
      { id: 'algebra_systems', labelEs: 'Sistemas de ecuaciones', labelFr: "Systèmes d'équations" },
    ],
  },
  {
    id: 'logarithms_exponentials',
    labelEs: 'Logaritmos y exponenciales',
    labelFr: 'Logarithmes et exponentielles',
    subtopics: [
      { id: 'logexp_logarithms', labelEs: 'Logaritmos', labelFr: 'Logarithmes' },
      { id: 'logexp_logarithm_properties', labelEs: 'Propiedades de logaritmos', labelFr: 'Propriétés des logarithmes' },
      { id: 'logexp_logarithmic_equations', labelEs: 'Ecuaciones logarítmicas', labelFr: 'Équations logarithmiques' },
      { id: 'logexp_logarithmic_functions', labelEs: 'Funciones logarítmicas', labelFr: 'Fonctions logarithmiques' },
      { id: 'logexp_exponential_functions', labelEs: 'Funciones exponenciales', labelFr: 'Fonctions exponentielles' },
      { id: 'logexp_exponential_equations', labelEs: 'Ecuaciones exponenciales', labelFr: 'Équations exponentielles' },
    ],
  },
  {
    id: 'functions',
    labelEs: 'Funciones',
    labelFr: 'Fonctions',
    subtopics: [
      { id: 'functions_concept', labelEs: 'Concepto de función', labelFr: 'Concept de fonction' },
      { id: 'functions_domain_range', labelEs: 'Dominio y rango', labelFr: 'Domaine et image' },
      { id: 'functions_linear', labelEs: 'Funciones lineales', labelFr: 'Fonctions linéaires' },
      { id: 'functions_quadratic', labelEs: 'Funciones cuadráticas', labelFr: 'Fonctions quadratiques' },
      { id: 'functions_polynomial', labelEs: 'Funciones polinómicas', labelFr: 'Fonctions polynomiales' },
      { id: 'functions_rational', labelEs: 'Funciones racionales', labelFr: 'Fonctions rationnelles' },
      { id: 'functions_graphical_analysis', labelEs: 'Análisis gráfico', labelFr: 'Analyse graphique' },
    ],
  },
  {
    id: 'geometry',
    labelEs: 'Geometría',
    labelFr: 'Géométrie',
    subtopics: [
      { id: 'geometry_plane_figures', labelEs: 'Figuras planas', labelFr: 'Figures planes' },
      { id: 'geometry_perimeter_area', labelEs: 'Perímetro y área', labelFr: 'Périmètre et aire' },
      { id: 'geometry_similarity_congruence', labelEs: 'Semejanza y congruencia', labelFr: 'Similarité et congruence' },
      { id: 'geometry_circumference', labelEs: 'Circunferencia', labelFr: 'Circonférence' },
      { id: 'geometry_spatial', labelEs: 'Geometría espacial', labelFr: 'Géométrie de l’espace' },
    ],
  },
  {
    id: 'analytic_geometry',
    labelEs: 'Geometría analítica',
    labelFr: 'Géométrie analytique',
    subtopics: [
      { id: 'analytic_geometry_cartesian_plane', labelEs: 'Plano cartesiano', labelFr: 'Plan cartésien' },
      { id: 'analytic_geometry_distance_midpoint', labelEs: 'Distancia y punto medio', labelFr: 'Distance et point milieu' },
      { id: 'analytic_geometry_line', labelEs: 'Recta', labelFr: 'Droite' },
      { id: 'analytic_geometry_circumference', labelEs: 'Circunferencia', labelFr: 'Circonférence' },
      { id: 'analytic_geometry_parabola', labelEs: 'Parábola', labelFr: 'Parabole' },
      { id: 'analytic_geometry_ellipse', labelEs: 'Elipse', labelFr: 'Ellipse' },
      { id: 'analytic_geometry_hyperbola', labelEs: 'Hipérbola', labelFr: 'Hyperbole' },
    ],
  },
  {
    id: 'trigonometry',
    labelEs: 'Trigonometría',
    labelFr: 'Trigonométrie',
    subtopics: [
      { id: 'trigonometry_ratios', labelEs: 'Razones trigonométricas', labelFr: 'Rapports trigonométriques' },
      { id: 'trigonometry_identities', labelEs: 'Identidades trigonométricas', labelFr: 'Identités trigonométriques' },
      { id: 'trigonometry_equations', labelEs: 'Ecuaciones trigonométricas', labelFr: 'Équations trigonométriques' },
      { id: 'trigonometry_triangles', labelEs: 'Resolución de triángulos', labelFr: 'Résolution de triangles' },
    ],
  },
  {
    id: 'statistics',
    labelEs: 'Estadística',
    labelFr: 'Statistique',
    subtopics: [
      { id: 'statistics_data_organization', labelEs: 'Organización de datos', labelFr: 'Organisation des données' },
      { id: 'statistics_central_tendency', labelEs: 'Medidas de tendencia central', labelFr: 'Mesures de tendance centrale' },
      { id: 'statistics_dispersion', labelEs: 'Medidas de dispersión', labelFr: 'Mesures de dispersion' },
    ],
  },
  {
    id: 'vectors',
    labelEs: 'Vectores',
    labelFr: 'Vecteurs',
    subtopics: [
      { id: 'vectors_norm', labelEs: 'Norma', labelFr: 'Norme' },
      { id: 'vectors_addition_subtraction', labelEs: 'Suma y resta de vectores', labelFr: 'Addition et soustraction de vecteurs' },
      { id: 'vectors_chasles', labelEs: 'RelaciÃ³n de Chasles', labelFr: 'Relation de Chasles' },
      { id: 'vectors_scalar_multiplication', labelEs: 'MultiplicaciÃ³n por escalar', labelFr: 'Multiplication par un scalaire' },
      { id: 'vectors_linear_combination', labelEs: 'CombinaciÃ³n lineal', labelFr: 'Combinaison linÃ©aire' },
      { id: 'vectors_dot_product', labelEs: 'Producto punto', labelFr: 'Produit scalaire' },
      { id: 'vectors_cross_product', labelEs: 'Producto vectorial', labelFr: 'Produit vectoriel' },
      { id: 'vectors_projection', labelEs: 'ProyecciÃ³n vectorial', labelFr: 'Projection vectorielle' },
      { id: 'vectors_angle', labelEs: 'Ãngulo entre vectores', labelFr: 'Angle entre vecteurs' },
      { id: 'vectors_collinearity_coplanarity', labelEs: 'Colinealidad y coplanaridad', labelFr: 'ColinÃ©aritÃ© et coplanaritÃ©' },
      { id: 'vectors_components_coordinates', labelEs: 'Componentes y coordenadas', labelFr: 'Composantes et coordonnÃ©es' },
      { id: 'vectors_basis', labelEs: 'Base vectorial', labelFr: 'Base vectorielle' },
    ],
  },
  {
    id: 'probability',
    labelEs: 'Probabilidad',
    labelFr: 'Probabilité',
    subtopics: [
      { id: 'probability_simple', labelEs: 'Probabilidad simple', labelFr: 'Probabilité simple' },
      { id: 'probability_compound', labelEs: 'Probabilidad compuesta', labelFr: 'Probabilité composée' },
      { id: 'probability_counting_combinatorics', labelEs: 'Conteo y combinatoria', labelFr: 'Dénombrement et combinatoire' },
    ],
  },
  {
    id: 'calculus_i',
    labelEs: 'Cálculo I',
    labelFr: 'Calcul I',
    subtopics: [
      { id: 'calculus_i_real_numbers', labelEs: 'Números reales', labelFr: 'Nombres réels' },
      { id: 'calculus_i_intervals_absolute', labelEs: 'Intervalos y valor absoluto', labelFr: 'Intervalles et valeur absolue' },
      { id: 'calculus_i_real_functions', labelEs: 'Funciones reales', labelFr: 'Fonctions réelles' },
      { id: 'calculus_i_limits', labelEs: 'Límites', labelFr: 'Limites' },
      { id: 'calculus_i_continuity', labelEs: 'Continuidad', labelFr: 'Continuité' },
      { id: 'calculus_i_derivatives', labelEs: 'Derivadas', labelFr: 'Dérivées' },
      { id: 'calculus_i_derivative_rules', labelEs: 'Reglas de derivación', labelFr: 'Règles de dérivation' },
      { id: 'calculus_i_derivative_applications', labelEs: 'Aplicaciones de la derivada', labelFr: 'Applications de la dérivée' },
      { id: 'calculus_i_indefinite_integrals', labelEs: 'Integrales indefinidas', labelFr: 'Intégrales indéfinies' },
      { id: 'calculus_i_definite_integrals', labelEs: 'Integrales definidas', labelFr: 'Intégrales définies' },
      { id: 'calculus_i_integration_techniques', labelEs: 'Técnicas de integración', labelFr: "Techniques d'intégration" },
      { id: 'calculus_i_integral_applications', labelEs: 'Aplicaciones de la integral', labelFr: "Applications de l'intégrale" },
    ],
  },
  {
    id: 'calculus_ii',
    labelEs: 'Cálculo II',
    labelFr: 'Calcul II',
    subtopics: [
      { id: 'calculus_ii_series_sequences', labelEs: 'Series y sucesiones', labelFr: 'Séries et suites' },
      { id: 'calculus_ii_parametric_functions', labelEs: 'Funciones paramétricas', labelFr: 'Fonctions paramétriques' },
      { id: 'calculus_ii_vector_functions', labelEs: 'Funciones vectoriales', labelFr: 'Fonctions vectorielles' },
    ],
  },
  {
    id: 'differential_equations',
    labelEs: 'Ecuaciones diferenciales',
    labelFr: 'Équations différentielles',
    subtopics: [
      { id: 'diff_eq_first_order', labelEs: 'Ecuaciones diferenciales de primer orden', labelFr: 'Équations différentielles du premier ordre' },
      { id: 'diff_eq_separable', labelEs: 'Variables separables', labelFr: 'Variables séparables' },
      { id: 'diff_eq_linear', labelEs: 'Ecuaciones lineales', labelFr: 'Équations linéaires' },
      { id: 'diff_eq_second_order', labelEs: 'Ecuaciones de segundo orden', labelFr: 'Équations du second ordre' },
    ],
  },
  {
    id: PENDING_ID,
    labelEs: 'Pendiente de normalización',
    labelFr: 'Normalisation en attente',
    subtopics: [
      { id: PENDING_ID, labelEs: 'Pendiente de normalización', labelFr: 'Normalisation en attente' },
    ],
  },
]

export const TECHNIQUE_EFFECT_TYPE_OPTIONS = [
  { id: 'transformation', labelEs: 'Transformación', labelFr: 'Transformation' },
  { id: 'criterion', labelEs: 'Criterio', labelFr: 'Critère' },
  { id: 'strategy', labelEs: 'Estrategia', labelFr: 'Stratégie' },
  { id: 'decomposition', labelEs: 'Descomposición', labelFr: 'Décomposition' },
  { id: 'construction', labelEs: 'Construcción', labelFr: 'Construction' },
  { id: 'counting', labelEs: 'Conteo', labelFr: 'Dénombrement' },
  { id: 'bounding', labelEs: 'Acotación', labelFr: 'Encadrement' },
  { id: 'invariant', labelEs: 'Invariante', labelFr: 'Invariant' },
  { id: 'operation', labelEs: 'Operación', labelFr: 'Opération' },
  { id: 'representation', labelEs: 'Representación', labelFr: 'Représentation' },
  { id: 'resolution', labelEs: 'Resolución', labelFr: 'Résolution' },
  { id: 'analysis', labelEs: 'Análisis', labelFr: 'Analyse' },
  { id: 'modeling', labelEs: 'Modelación', labelFr: 'Modélisation' },
  { id: PENDING_ID, labelEs: 'Pendiente de normalización', labelFr: 'Normalisation en attente' },
]

function normalizeValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function findTopicOptionById(topicId) {
  return TECHNIQUE_TOPIC_OPTIONS.find((option) => option.id === topicId) || null
}

function findEffectTypeOptionById(effectTypeId) {
  return TECHNIQUE_EFFECT_TYPE_OPTIONS.find((option) => option.id === effectTypeId) || null
}

function findTopicOptionByValue(value) {
  const normalized = normalizeValue(value)
  if (!normalized) return null

  return TECHNIQUE_TOPIC_OPTIONS.find((option) => (
    option.id === normalized
    || normalizeValue(option.labelEs) === normalized
    || normalizeValue(option.labelFr) === normalized
  )) || null
}

function findSubtopicOption(topicId, value) {
  const normalized = normalizeValue(value)
  const topic = findTopicOptionById(topicId)
  if (!topic || !normalized) return null

  return topic.subtopics.find((option) => (
    option.id === normalized
    || normalizeValue(option.labelEs) === normalized
    || normalizeValue(option.labelFr) === normalized
  )) || null
}

function findEffectTypeOptionByValue(value) {
  const normalized = normalizeValue(value)
  if (!normalized) return null

  return TECHNIQUE_EFFECT_TYPE_OPTIONS.find((option) => (
    option.id === normalized
    || normalizeValue(option.labelEs) === normalized
    || normalizeValue(option.labelFr) === normalized
  )) || null
}

export function getTopicOptionLabel(topicOption, language = 'es') {
  if (!topicOption) return ''
  return language === 'fr' ? topicOption.labelFr : topicOption.labelEs
}

export function getSubtopicOptionLabel(subtopicOption, language = 'es') {
  if (!subtopicOption) return ''
  return language === 'fr' ? subtopicOption.labelFr : subtopicOption.labelEs
}

export function getEffectTypeOptionLabel(effectTypeOption, language = 'es') {
  if (!effectTypeOption) return ''
  return language === 'fr' ? effectTypeOption.labelFr : effectTypeOption.labelEs
}

export function getTechniqueTopicOptions(language = 'es') {
  return TECHNIQUE_TOPIC_OPTIONS.map((option) => ({
    value: option.id,
    label: getTopicOptionLabel(option, language),
  }))
}

export function getTechniqueSubtopicOptions(topicId, language = 'es') {
  const topic = findTopicOptionById(topicId)
  if (!topic) return []

  return topic.subtopics.map((option) => ({
    value: option.id,
    label: getSubtopicOptionLabel(option, language),
  }))
}

export function getTechniqueEffectTypeOptions(language = 'es') {
  return TECHNIQUE_EFFECT_TYPE_OPTIONS.map((option) => ({
    value: option.id,
    label: getEffectTypeOptionLabel(option, language),
  }))
}

export function getTechniqueTaxonomySelection(row, options = {}) {
  const { fallbackPending = false } = options
  const topicOption =
    findTopicOptionByValue(row?.topic)
    || findTopicOptionByValue(row?.topic_fr)
    || (fallbackPending && (row?.topic || row?.topic_fr) ? findTopicOptionById(PENDING_ID) : null)

  const subtopicOption =
    findSubtopicOption(topicOption?.id, row?.subtopic)
    || findSubtopicOption(topicOption?.id, row?.subtopic_fr)
    || (fallbackPending && (row?.subtopic || row?.subtopic_fr) ? findSubtopicOption(topicOption?.id || PENDING_ID, PENDING_ID) : null)

  const effectTypeOption =
    findEffectTypeOptionByValue(row?.effect_type)
    || findEffectTypeOptionByValue(row?.effect_type_fr)
    || (fallbackPending && (row?.effect_type || row?.effect_type_fr) ? findEffectTypeOptionById(PENDING_ID) : null)

  return {
    topicId: topicOption?.id || '',
    subtopicId: subtopicOption?.id || '',
    effectTypeId: effectTypeOption?.id || '',
  }
}

export function resolveTechniqueTaxonomyFromIds(selection) {
  const topicOption = findTopicOptionById(selection?.topicId)
  const subtopicOption = findSubtopicOption(selection?.topicId, selection?.subtopicId)
  const effectTypeOption = findEffectTypeOptionById(selection?.effectTypeId)

  return {
    topic: topicOption?.labelEs || '',
    topicFr: topicOption?.labelFr || '',
    subtopic: subtopicOption?.labelEs || '',
    subtopicFr: subtopicOption?.labelFr || '',
    effectType: effectTypeOption?.labelEs || '',
    effectTypeFr: effectTypeOption?.labelFr || '',
  }
}

export function canonicalizeTechniqueTaxonomyInput(input) {
  const topicOption =
    findTopicOptionById(input?.topicKey)
    || findTopicOptionByValue(input?.topic)
    || findTopicOptionByValue(input?.topicFr)

  if (!topicOption) {
    return { error: 'Unknown topic value. Use one of the predefined taxonomy options.' }
  }

  const subtopicOption =
    findSubtopicOption(topicOption.id, input?.subtopicKey)
    || findSubtopicOption(topicOption.id, input?.subtopic)
    || findSubtopicOption(topicOption.id, input?.subtopicFr)

  if (!subtopicOption) {
    return { error: 'Unknown subtopic value for the selected topic.' }
  }

  const effectTypeOption =
    findEffectTypeOptionById(input?.effectTypeKey)
    || findEffectTypeOptionByValue(input?.effectType)
    || findEffectTypeOptionByValue(input?.effectTypeFr)

  if (!effectTypeOption) {
    return { error: 'Unknown effect type value. Use one of the predefined taxonomy options.' }
  }

  return {
    topicId: topicOption.id,
    subtopicId: subtopicOption.id,
    effectTypeId: effectTypeOption.id,
    topic: topicOption.labelEs,
    topicFr: topicOption.labelFr,
    subtopic: subtopicOption.labelEs,
    subtopicFr: subtopicOption.labelFr,
    effectType: effectTypeOption.labelEs,
    effectTypeFr: effectTypeOption.labelFr,
  }
}

export function getTechniqueTaxonomyNotes() {
  const topics = TECHNIQUE_TOPIC_OPTIONS.map((option) => `${option.labelEs} / ${option.labelFr}`).join(', ')
  const effectTypes = TECHNIQUE_EFFECT_TYPE_OPTIONS.map((option) => `${option.labelEs} / ${option.labelFr}`).join(', ')

  return {
    topics,
    effectTypes,
  }
}

export function getTechniqueTaxonomyReference() {
  return {
    topics: TECHNIQUE_TOPIC_OPTIONS.map((topic) => ({
      key: topic.id,
      labelEs: topic.labelEs,
      labelFr: topic.labelFr,
      subtopics: topic.subtopics.map((subtopic) => ({
        key: subtopic.id,
        labelEs: subtopic.labelEs,
        labelFr: subtopic.labelFr,
      })),
    })),
    effectTypes: TECHNIQUE_EFFECT_TYPE_OPTIONS.map((effectType) => ({
      key: effectType.id,
      labelEs: effectType.labelEs,
      labelFr: effectType.labelFr,
    })),
  }
}

export { PENDING_ID as TECHNIQUE_TAXONOMY_PENDING_ID }
