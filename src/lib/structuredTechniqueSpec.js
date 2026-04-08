const SUPPORTED_ARCHETYPES = new Set([
  'selection_only',
  'replace_in_target',
  'selection_plus_parameter',
])

const SUPPORTED_INPUT_TYPES = new Set([
  'text',
  'math_text',
  'reference',
  'reference_or_text',
  'reference_or_selection',
  'choice',
])

const SUPPORTED_OPERATIONS = new Set([
  'factor_selection',
  'expand_selection',
  'simplify_selection',
  'differentiate_selection',
  'integrate_selection',
  'solve_selection_for_variable',
  'replace_symbol_in_target',
])

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toTrimmedString(value) {
  return String(value || '').trim()
}

function normalizeInputSpecEntry(entry) {
  if (!isPlainObject(entry)) return null
  const id = toTrimmedString(entry.id)
  const type = toTrimmedString(entry.type)
  if (!id || !type) return null

  const normalized = {
    id,
    type,
    required: Boolean(entry.required),
    labelEs: toTrimmedString(entry.labelEs || entry.label_es || entry.label || id),
    labelFr: toTrimmedString(entry.labelFr || entry.label_fr || entry.label || id),
    placeholderEs: toTrimmedString(entry.placeholderEs || entry.placeholder_es),
    placeholderFr: toTrimmedString(entry.placeholderFr || entry.placeholder_fr),
  }

  if (type === 'choice' && Array.isArray(entry.options)) {
    normalized.options = entry.options
      .map((option) => {
        if (!isPlainObject(option)) return null
        const value = toTrimmedString(option.value)
        if (!value) return null
        return {
          value,
          labelEs: toTrimmedString(option.labelEs || option.label_es || option.label || value),
          labelFr: toTrimmedString(option.labelFr || option.label_fr || option.label || value),
        }
      })
      .filter(Boolean)
  }

  return normalized
}

function normalizeStepTemplate(step) {
  if (!isPlainObject(step)) return null
  return {
    kind: toTrimmedString(step.kind || 'text') || 'text',
    textEs: toTrimmedString(step.textEs || step.text_es || step.text),
    textFr: toTrimmedString(step.textFr || step.text_fr || step.text),
  }
}

function defaultNarrationForSpec(archetype, operation) {
  if (archetype === 'replace_in_target') {
    return {
      introEs: 'Aplicando la tecnica:',
      introFr: 'En appliquant la technique :',
      stepsMode: 'compact',
      stepTemplates: [
        {
          kind: 'text',
          textEs: 'Reemplazando {source} en {target}:',
          textFr: 'En remplacant {source} dans {target} :',
        },
      ],
    }
  }

  if (archetype === 'selection_plus_parameter') {
    if (operation === 'differentiate_selection') {
      return {
        introEs: 'Aplicando la derivacion:',
        introFr: 'En appliquant la derivation :',
        stepsMode: 'compact',
        stepTemplates: [
          {
            kind: 'text',
            textEs: 'Derivamos respecto de {variable}:',
            textFr: 'On derive par rapport a {variable} :',
          },
        ],
      }
    }

    if (operation === 'integrate_selection') {
      return {
        introEs: 'Aplicando la integracion:',
        introFr: 'En appliquant l integration :',
        stepsMode: 'compact',
        stepTemplates: [
          {
            kind: 'text',
            textEs: 'Integramos respecto de {variable}:',
            textFr: 'On integre par rapport a {variable} :',
          },
        ],
      }
    }

    if (operation === 'solve_selection_for_variable') {
      return {
        introEs: 'Aplicando la resolucion:',
        introFr: 'En appliquant la resolution :',
        stepsMode: 'compact',
        stepTemplates: [
          {
            kind: 'text',
            textEs: 'Resolvemos respecto de {variable}:',
            textFr: 'On resout par rapport a {variable} :',
          },
        ],
      }
    }
  }

  if (operation === 'factor_selection') {
    return {
      introEs: 'Aplicando la factorizacion:',
      introFr: 'En appliquant la factorisation :',
      stepsMode: 'compact',
      stepTemplates: [
        {
          kind: 'text',
          textEs: 'Factorizamos la expresion seleccionada:',
          textFr: 'On factorise l expression selectionnee :',
        },
      ],
    }
  }

  if (operation === 'expand_selection') {
    return {
      introEs: 'Aplicando el desarrollo:',
      introFr: 'En appliquant le developpement :',
      stepsMode: 'compact',
      stepTemplates: [
        {
          kind: 'text',
          textEs: 'Desarrollamos la expresion seleccionada:',
          textFr: 'On developpe l expression selectionnee :',
        },
      ],
    }
  }

  return {
    introEs: 'Aplicando la tecnica:',
    introFr: 'En appliquant la technique :',
    stepsMode: 'compact',
    stepTemplates: [
      {
        kind: 'text',
        textEs: 'Transformamos la expresion seleccionada:',
        textFr: 'On transforme l expression selectionnee :',
      },
    ],
  }
}

export function parseStructuredTechniqueSpec(rawValue) {
  if (!rawValue) return null
  if (isPlainObject(rawValue)) return rawValue

  const rawText = String(rawValue || '').trim()
  if (!rawText) return null

  try {
    const parsed = JSON.parse(rawText)
    return isPlainObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function stringifyStructuredTechniqueSpec(rawValue) {
  const parsed = parseStructuredTechniqueSpec(rawValue)
  return parsed ? JSON.stringify(parsed, null, 2) : ''
}

export function normalizeStructuredTechniqueSpec(rawValue) {
  const parsed = parseStructuredTechniqueSpec(rawValue)
  if (!parsed) return null

  const archetype = toTrimmedString(parsed.archetype)
  const operationSpec = isPlainObject(parsed.operationSpec) ? parsed.operationSpec : {}
  const operation = toTrimmedString(operationSpec.operation)
  const inputSpec = Array.isArray(parsed.inputSpec) ? parsed.inputSpec.map(normalizeInputSpecEntry).filter(Boolean) : []
  const baseNarration = defaultNarrationForSpec(archetype, operation)
  const narrationSpec = isPlainObject(parsed.narrationSpec) ? parsed.narrationSpec : {}
  const renderSpec = isPlainObject(parsed.renderSpec) ? parsed.renderSpec : {}

  return {
    version: toTrimmedString(parsed.version || 'v1') || 'v1',
    archetype,
    inputSpec,
    operationSpec: {
      family: toTrimmedString(operationSpec.family),
      operation,
      arguments: isPlainObject(operationSpec.arguments) ? operationSpec.arguments : {},
    },
    narrationSpec: {
      introEs: toTrimmedString(narrationSpec.introEs || narrationSpec.intro_es || baseNarration.introEs),
      introFr: toTrimmedString(narrationSpec.introFr || narrationSpec.intro_fr || baseNarration.introFr),
      stepsMode: toTrimmedString(narrationSpec.stepsMode || narrationSpec.steps_mode || baseNarration.stepsMode || 'compact') || 'compact',
      stepTemplates: (
        Array.isArray(narrationSpec.stepTemplates)
          ? narrationSpec.stepTemplates.map(normalizeStepTemplate).filter(Boolean)
          : baseNarration.stepTemplates
      ),
    },
    renderSpec: {
      finalResultMode: toTrimmedString(renderSpec.finalResultMode || renderSpec.final_result_mode || 'result_only') || 'result_only',
      displayStyle: toTrimmedString(renderSpec.displayStyle || renderSpec.display_style || 'math_block') || 'math_block',
      allowDuplicateFinalLine: Boolean(renderSpec.allowDuplicateFinalLine || renderSpec.allow_duplicate_final_line),
    },
  }
}

export function validateStructuredTechniqueSpec(rawValue) {
  const spec = normalizeStructuredTechniqueSpec(rawValue)
  if (!rawValue || !String(rawValue).trim()) return ''
  if (!spec) return 'Structured Technique Spec debe ser un JSON valido.'
  if (spec.version !== 'v1') return 'Structured Technique Spec debe declarar `version: "v1"`.'
  if (!SUPPORTED_ARCHETYPES.has(spec.archetype)) {
    return 'Structured Technique Spec usa un `archetype` no soportado.'
  }
  if (!SUPPORTED_OPERATIONS.has(spec.operationSpec.operation)) {
    return 'Structured Technique Spec usa una `operationSpec.operation` no soportada.'
  }

  const ids = new Set()
  for (const input of spec.inputSpec) {
    if (!SUPPORTED_INPUT_TYPES.has(input.type)) {
      return `Structured Technique Spec usa un tipo de input no soportado: ${input.type}.`
    }
    if (ids.has(input.id)) {
      return `Structured Technique Spec repite el input id \`${input.id}\`.`
    }
    ids.add(input.id)
    if (input.type === 'choice' && (!Array.isArray(input.options) || !input.options.length)) {
      return `Structured Technique Spec requiere opciones para el input choice \`${input.id}\`.`
    }
  }

  if (spec.archetype === 'selection_plus_parameter') {
    const variableInputId = toTrimmedString(spec.operationSpec.arguments?.variableInputId)
    if (!variableInputId) return 'Structured Technique Spec requiere `variableInputId` para `selection_plus_parameter`.'
    if (!ids.has(variableInputId)) return 'Structured Technique Spec referencia un `variableInputId` inexistente.'
  }

  if (spec.archetype === 'replace_in_target') {
    const targetInputId = toTrimmedString(spec.operationSpec.arguments?.targetInputId)
    if (!targetInputId) return 'Structured Technique Spec requiere `targetInputId` para `replace_in_target`.'
    if (!ids.has(targetInputId)) return 'Structured Technique Spec referencia un `targetInputId` inexistente.'
  }

  return ''
}

export function buildStructuredTechniqueInputDefinition(rawValue) {
  const spec = normalizeStructuredTechniqueSpec(rawValue)
  if (!spec) return null
  return {
    inputs: spec.inputSpec,
    introTemplateEs: spec.narrationSpec.introEs,
    introTemplateFr: spec.narrationSpec.introFr,
  }
}

function buildPythonJsonLiteral(value) {
  return JSON.stringify(JSON.stringify(value))
}

export function compileStructuredTechniqueSpecToSympy(rawValue) {
  const spec = normalizeStructuredTechniqueSpec(rawValue)
  if (!spec) return ''

  const specLiteral = buildPythonJsonLiteral(spec)
  return `SPEC = json.loads(${specLiteral})

def describe(context):
    return {
        'inputs': SPEC.get('inputSpec') or []
    }

def _get_locale(context):
    return str(context.get('locale') or 'es').strip() or 'es'

def _get_inputs(context):
    options = context.get('options')
    if not isinstance(options, dict):
        return {}
    raw_inputs = options.get('inputs')
    return raw_inputs if isinstance(raw_inputs, dict) else {}

def _get_input(inputs, input_id):
    if not input_id or not isinstance(inputs, dict):
        return {}
    raw_value = inputs.get(input_id) or {}
    return raw_value if isinstance(raw_value, dict) else {}

def _get_text(inputs, input_id):
    return str(_get_input(inputs, input_id).get('text') or '').strip()

def _pick_locale_text(step, locale):
    if not isinstance(step, dict):
        return ''
    if locale == 'fr':
        return str(step.get('textFr') or step.get('text_fr') or step.get('text') or '').strip()
    return str(step.get('textEs') or step.get('text_es') or step.get('text') or '').strip()

def _interpolate(template, values):
    result = str(template or '')
    for key, value in values.items():
        result = result.replace('{' + str(key) + '}', str(value or ''))
    return result.strip()

def _build_steps(step_templates, values):
    steps = []
    for step in step_templates or []:
        if not isinstance(step, dict):
            continue
        text_es = _interpolate(step.get('textEs') or step.get('text_es') or step.get('text') or '', values)
        text_fr = _interpolate(step.get('textFr') or step.get('text_fr') or step.get('text') or '', values)
        if text_es or text_fr:
            steps.append({
                'text_es': text_es,
                'text_fr': text_fr,
            })
    return steps

def _build_result_payload(value):
    if value is None:
        return None
    try:
        latex_value = latex(value)
        return {
            'latex': latex_value,
            'text': latex_value,
        }
    except Exception:
        text_value = str(value)
        return {
            'text': text_value,
        }

def _append_result_as_step(steps, result_payload):
    if not isinstance(result_payload, dict):
        return steps
    latex_value = str(result_payload.get('latex') or '').strip()
    text_value = str(result_payload.get('text') or '').strip()
    if latex_value:
        return list(steps) + [{'latex': latex_value}]
    if text_value:
        return list(steps) + [{'text_es': text_value, 'text_fr': text_value}]
    return list(steps)

def _split_assignment(raw):
    text = str(raw or '').strip()
    if '=' not in text:
        return None
    left, right = text.split('=', 1)
    return left.strip(), right.strip()

def _is_identifier_char(ch):
    if not ch:
        return False
    return ch.isalnum() or ch == '_'

def _is_simple_atom(raw):
    value = str(raw or '').strip()
    if not value:
        return False
    allowed = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_\\\\{}'
    for ch in value:
        if ch not in allowed:
            return False
    return True

def _format_replacement(raw, prev_char='', next_char=''):
    value = str(raw or '').strip()
    if not value:
        return value
    if _is_simple_atom(value):
        return value
    needs_wrap = False
    if prev_char and (_is_identifier_char(prev_char) or prev_char in [')', '}', '\\\\']):
        needs_wrap = True
    if next_char and (_is_identifier_char(next_char) or next_char in ['^', '_', '(', '{', '\\\\']):
        needs_wrap = True
    if needs_wrap:
        return '\\\\left(' + value + '\\\\right)'
    return value

def _substitute_symbol_in_text(expr, symbol, replacement):
    expr = str(expr or '')
    symbol = str(symbol or '').strip()
    replacement = str(replacement or '').strip()
    if not expr or not symbol:
        return expr
    result = []
    i = 0
    n = len(expr)
    m = len(symbol)
    while i < n:
        chunk = expr[i:i + m]
        if chunk == symbol:
            prev_char = expr[i - 1] if i > 0 else ''
            next_char = expr[i + m] if i + m < n else ''
            prev_ok = not _is_identifier_char(prev_char)
            next_ok = not _is_identifier_char(next_char)
            if prev_ok and next_ok:
                result.append(_format_replacement(replacement, prev_char, next_char))
                i += m
                continue
        result.append(expr[i])
        i += 1
    return ''.join(result)

def transform(context):
    spec = SPEC
    locale = _get_locale(context)
    selected_text = str(context.get('selected_text') or '').strip()
    inputs = _get_inputs(context)
    operation_spec = spec.get('operationSpec') if isinstance(spec.get('operationSpec'), dict) else {}
    operation = str(operation_spec.get('operation') or '').strip()
    arguments = operation_spec.get('arguments') if isinstance(operation_spec.get('arguments'), dict) else {}
    narration = spec.get('narrationSpec') if isinstance(spec.get('narrationSpec'), dict) else {}
    render = spec.get('renderSpec') if isinstance(spec.get('renderSpec'), dict) else {}
    intro_es = str(narration.get('introEs') or '').strip()
    intro_fr = str(narration.get('introFr') or '').strip()
    step_templates = narration.get('stepTemplates') if isinstance(narration.get('stepTemplates'), list) else []
    archetype = str(spec.get('archetype') or '').strip()
    values = {
        'selection': selected_text,
    }

    if archetype == 'selection_only':
        if not selected_text:
            raise ValueError('Debes seleccionar primero una expresion matematica.')
        expr = parse_math(selected_text)
        if operation == 'factor_selection':
            result_value = factor(expr)
        elif operation == 'expand_selection':
            result_value = expand(expr)
        elif operation == 'simplify_selection':
            result_value = simplify(expr)
        else:
            raise ValueError('Operacion no soportada para selection_only.')
        result_payload = _build_result_payload(result_value)

    elif archetype == 'selection_plus_parameter':
        if not selected_text:
            raise ValueError('Debes seleccionar primero una expresion matematica.')
        variable_input_id = str(arguments.get('variableInputId') or '').strip()
        variable_text = _get_text(inputs, variable_input_id)
        if not variable_text:
            raise ValueError('Falta el parametro requerido para la tecnica.')
        expr = parse_math(selected_text)
        variable_value = parse_math(variable_text)
        values['variable'] = variable_text
        if operation == 'differentiate_selection':
            result_value = diff(expr, variable_value)
        elif operation == 'integrate_selection':
            result_value = integrate(expr, variable_value)
        elif operation == 'solve_selection_for_variable':
            result_value = solve(expr, variable_value)
        else:
            raise ValueError('Operacion no soportada para selection_plus_parameter.')
        result_payload = _build_result_payload(result_value)

    elif archetype == 'replace_in_target':
        if not selected_text:
            raise ValueError('Debes seleccionar primero el valor o la igualdad a sustituir.')
        target_input_id = str(arguments.get('targetInputId') or '').strip()
        variable_input_id = str(arguments.get('variableInputId') or '').strip()
        target_text = _get_text(inputs, target_input_id)
        if not target_text:
            raise ValueError('Falta la expresion o referencia destino donde aplicar la sustitucion.')
        assignment = _split_assignment(selected_text)
        if assignment is not None:
            variable_name, replacement_value = assignment
            source_display = selected_text
        else:
            variable_name = _get_text(inputs, variable_input_id)
            replacement_value = selected_text
            if not variable_name:
                raise ValueError('Si seleccionas solo el valor, debes indicar tambien la variable a reemplazar.')
            source_display = variable_name + '=' + replacement_value
        result_text = _substitute_symbol_in_text(target_text, variable_name, replacement_value)
        values.update({
            'source': source_display,
            'target': target_text,
            'variable': variable_name,
            'replacement': replacement_value,
            'result': result_text,
        })
        result_payload = {
            'latex': result_text,
            'text': result_text,
        }

    else:
        raise ValueError('Archetype no soportado por Structured Technique Spec.')

    steps = _build_steps(step_templates, values)
    final_mode = str(render.get('finalResultMode') or 'result_only').strip() or 'result_only'
    allow_duplicate = bool(render.get('allowDuplicateFinalLine'))

    if final_mode == 'last_step_only':
        steps = _append_result_as_step(steps, result_payload)
        result_payload = None
    elif final_mode == 'step_and_result' and allow_duplicate:
        steps = _append_result_as_step(steps, result_payload)

    response = {
        'intro_es': intro_es,
        'intro_fr': intro_fr,
        'steps': steps,
    }
    if result_payload is not None:
        response['result'] = result_payload
    return response
`
}

