# Technique Spec V1

## Purpose

Define a structured, notebook-compatible format for mathematical techniques so that:

- most techniques do not require raw custom SymPy code,
- AI can generate techniques with much lower error rate,
- the notebook can open the right contextual modal automatically,
- references and editor selections are handled consistently,
- bilingual output remains concise and school-friendly,
- the system scales from algebra to calculus.

This document defines the first practical version of that format.

## Design Principles

### 1. The notebook owns infrastructure

The notebook is responsible for:

- rich-editor selection capture,
- notebook references and derived references,
- contextual modal rendering,
- guided input collection,
- insertion point resolution,
- output rendering.

### 2. The technique spec owns behavior

The technique spec defines:

- what the technique asks for,
- what operation family it belongs to,
- how it should narrate the development,
- how the final result should be displayed.

### 3. SymPy remains the execution engine

The final execution still uses SymPy.

But in the main path, the app compiles the structured spec into a deterministic SymPy runtime behavior instead of relying on AI-generated free-form code.

### 4. School-first writing

The generated notebook development must remain:

- concise,
- bilingual,
- mathematically correct,
- accessible to school students.

## Root Shape

The proposed new runtime field is:

```json
{
  "structuredTechniqueSpec": {
    "version": "v1",
    "archetype": "replace_in_target",
    "inputSpec": [],
    "operationSpec": {},
    "narrationSpec": {},
    "renderSpec": {}
  }
}
```

This field is intended to live alongside the existing technique metadata.

## Field Definitions

## `version`

String.

Allowed value for now:

- `v1`

## `archetype`

String describing the runtime family of the technique.

Initial recommended archetypes:

- `selection_only`
- `replace_in_target`
- `equation_transform`
- `expression_rewrite`
- `selection_plus_parameter`
- `selection_plus_choice`
- `apply_reference_to_selection`
- `custom_teacher_only`

## `inputSpec`

Array of guided inputs that the notebook must request.

Each input object:

```json
{
  "id": "target_expression",
  "type": "reference_or_selection",
  "required": true,
  "labelEs": "Referencia o expresion destino",
  "labelFr": "Reference ou expression cible",
  "placeholderEs": "Ej. x^2+3x",
  "placeholderFr": "Ex. x^2+3x"
}
```

### Allowed input types

- `text`
  Plain user text.
- `math_text`
  Manual mathematical text that the operation may parse.
- `reference`
  Must choose a notebook reference.
- `reference_or_text`
  Either a notebook reference or manual text.
- `reference_or_selection`
  Either a notebook reference or the current rich-editor selection.
- `choice`
  A bounded option selected from a list.

### Optional fields for `choice`

```json
{
  "id": "solve_mode",
  "type": "choice",
  "required": true,
  "labelEs": "Modo de resolucion",
  "labelFr": "Mode de resolution",
  "options": [
    {
      "value": "exact",
      "labelEs": "Exacto",
      "labelFr": "Exact"
    },
    {
      "value": "simplified",
      "labelEs": "Simplificado",
      "labelFr": "Simplifie"
    }
  ]
}
```

## `operationSpec`

Describes what mathematical operation the runtime should perform.

This is the core of the deterministic execution path.

Base shape:

```json
{
  "family": "substitution",
  "operation": "replace_symbol_in_target",
  "arguments": {}
}
```

### Recommended operation families for V1

- `algebra_transform`
- `substitution`
- `equation_manipulation`
- `simplification`
- `factorization`
- `expansion`
- `solve`
- `derivative`
- `integral`
- `rewrite`
- `evaluation`

### Examples of V1 operations

#### Substitution

```json
{
  "family": "substitution",
  "operation": "replace_symbol_in_target",
  "arguments": {
    "sourceMode": "selection_or_assignment",
    "targetInputId": "target_expression",
    "variableInputId": "source_variable"
  }
}
```

#### Factorization

```json
{
  "family": "factorization",
  "operation": "factor_selection",
  "arguments": {}
}
```

#### Expand

```json
{
  "family": "expansion",
  "operation": "expand_selection",
  "arguments": {}
}
```

#### Derivative

```json
{
  "family": "derivative",
  "operation": "differentiate_selection",
  "arguments": {
    "variableInputId": "variable"
  }
}
```

#### Integral

```json
{
  "family": "integral",
  "operation": "integrate_selection",
  "arguments": {
    "variableInputId": "variable"
  }
}
```

## `narrationSpec`

Controls concise bilingual writing for the notebook output.

Base shape:

```json
{
  "introEs": "Aplicando el axioma de sustitucion:",
  "introFr": "En appliquant l axiome de substitution :",
  "stepsMode": "compact",
  "stepTemplates": [
    {
      "kind": "text",
      "textEs": "Reemplazando {source} en {target}:",
      "textFr": "En remplacant {source} dans {target} :"
    }
  ]
}
```

### `stepsMode`

Recommended initial values:

- `none`
- `compact`
- `guided`

For V1, prefer `compact`.

### Template variables

Allowed placeholders should be deterministic and runtime-driven:

- `{selection}`
- `{source}`
- `{target}`
- `{variable}`
- `{replacement}`
- `{result}`
- `{technique}`

The runtime should resolve these safely from the operation context.

## `renderSpec`

Controls how the final output is rendered.

Base shape:

```json
{
  "finalResultMode": "result_only",
  "displayStyle": "math_block",
  "allowDuplicateFinalLine": false
}
```

### Recommended fields

- `finalResultMode`
  - `result_only`
  - `last_step_only`
  - `step_and_result`
- `displayStyle`
  - `math_block`
  - `mixed_parts`
- `allowDuplicateFinalLine`
  - boolean

For V1, the preferred default is:

```json
{
  "finalResultMode": "result_only",
  "displayStyle": "math_block",
  "allowDuplicateFinalLine": false
}
```

## Runtime Expectations

When the notebook executes a structured technique, it should internally resolve:

- selection text,
- selection html,
- chosen references,
- manual text,
- input metadata,
- locale.

The compiler/runtime then maps that into a deterministic operation pipeline.

The final rendered output should follow:

1. optional `intro`
2. one or two concise steps
3. final result once

## V1 Reference Model

The notebook already manages references such as:

- `D1`
- `C1`
- `Q1`
- `E1`

Structured techniques must never create a parallel reference system.

If a technique needs a notebook reference:

- declare it in `inputSpec`,
- let the modal collect it,
- consume the resolved `text`, `referenceId`, `referenceCode`, and `html`.

## Example 1: Substitution

```json
{
  "version": "v1",
  "archetype": "replace_in_target",
  "inputSpec": [
    {
      "id": "source_variable",
      "type": "math_text",
      "required": false,
      "labelEs": "Variable a reemplazar",
      "labelFr": "Variable a remplacer",
      "placeholderEs": "Ej. x",
      "placeholderFr": "Ex. x"
    },
    {
      "id": "target_expression",
      "type": "reference_or_selection",
      "required": true,
      "labelEs": "Referencia o expresion destino",
      "labelFr": "Reference ou expression cible",
      "placeholderEs": "Ej. x^2+3x",
      "placeholderFr": "Ex. x^2+3x"
    }
  ],
  "operationSpec": {
    "family": "substitution",
    "operation": "replace_symbol_in_target",
    "arguments": {
      "sourceMode": "selection_or_assignment",
      "targetInputId": "target_expression",
      "variableInputId": "source_variable"
    }
  },
  "narrationSpec": {
    "introEs": "Aplicando el axioma de sustitucion:",
    "introFr": "En appliquant l axiome de substitution :",
    "stepsMode": "compact",
    "stepTemplates": [
      {
        "kind": "text",
        "textEs": "Reemplazando {source} en {target}:",
        "textFr": "En remplacant {source} dans {target} :"
      }
    ]
  },
  "renderSpec": {
    "finalResultMode": "result_only",
    "displayStyle": "math_block",
    "allowDuplicateFinalLine": false
  }
}
```

## Example 2: Derivative

```json
{
  "version": "v1",
  "archetype": "selection_plus_parameter",
  "inputSpec": [
    {
      "id": "variable",
      "type": "math_text",
      "required": true,
      "labelEs": "Variable de derivacion",
      "labelFr": "Variable de derivation",
      "placeholderEs": "Ej. x",
      "placeholderFr": "Ex. x"
    }
  ],
  "operationSpec": {
    "family": "derivative",
    "operation": "differentiate_selection",
    "arguments": {
      "variableInputId": "variable"
    }
  },
  "narrationSpec": {
    "introEs": "Aplicando la derivacion:",
    "introFr": "En appliquant la derivation :",
    "stepsMode": "compact",
    "stepTemplates": [
      {
        "kind": "text",
        "textEs": "Derivamos respecto de {variable}:",
        "textFr": "On derive par rapport a {variable} :"
      }
    ]
  },
  "renderSpec": {
    "finalResultMode": "result_only",
    "displayStyle": "math_block",
    "allowDuplicateFinalLine": false
  }
}
```

## Example 3: Factorization

```json
{
  "version": "v1",
  "archetype": "selection_only",
  "inputSpec": [],
  "operationSpec": {
    "family": "factorization",
    "operation": "factor_selection",
    "arguments": {}
  },
  "narrationSpec": {
    "introEs": "Aplicando la factorizacion:",
    "introFr": "En appliquant la factorisation :",
    "stepsMode": "compact",
    "stepTemplates": [
      {
        "kind": "text",
        "textEs": "Factorizamos la expresion seleccionada:",
        "textFr": "On factorise l expression selectionnee :"
      }
    ]
  },
  "renderSpec": {
    "finalResultMode": "result_only",
    "displayStyle": "math_block",
    "allowDuplicateFinalLine": false
  }
}
```

## What Still Needs Custom Code

Even with V1, some techniques may still require teacher-only custom code:

- highly specialized geometric notation,
- very custom pedagogical decompositions,
- unusual multi-stage symbolic workflows,
- advanced display rules that are not yet captured by the compiler.

These should be the exception, not the norm.

## Recommended Implementation Order

1. Add support for `structuredTechniqueSpec` as an optional field.
2. Implement compiler support for three archetypes first:
   - `selection_only`
   - `replace_in_target`
   - `selection_plus_parameter`
3. Keep current raw SymPy support for advanced techniques.
4. Add local validation for `structuredTechniqueSpec`.
5. Add AI generation against this structured spec instead of raw custom code.

## Recommendation

Use `structuredTechniqueSpec` as the main generation target for AI.

Keep raw SymPy code only as:

- fallback,
- teacher advanced mode,
- exceptional-case path.

This should significantly reduce retries, broken imports, and notebook incompatibilities while preserving enough flexibility to grow toward calculus.
