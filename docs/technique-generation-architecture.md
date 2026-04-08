# Technique Generation Architecture

## Goal

Build a notebook where a student can select one or more mathematical expressions and apply techniques that:

- ask only for the inputs they really need,
- understand notebook references and derived expressions,
- execute deterministic mathematical transformations,
- render concise bilingual step-by-step output,
- scale from school algebra to calculus,
- avoid excessive API cost and repeated manual correction.

## Problem Summary

The current method asks an AI to fill a JSON template with free-form SymPy code. This has several recurring failure modes:

- wrong notebook contract assumptions,
- incorrect input keys in `describe(context)`,
- incorrect input access in `transform(context)`,
- misuse of notebook references,
- `import` statements blocked by the sandboxed SymPy runner,
- mojibake in visible strings,
- duplicated final results,
- empty-input parsing errors such as `A mathematical input string is required.`,
- too many retries before a technique becomes truly compatible.

The root issue is not only prompt quality. The main issue is that the AI is asked to generate code for a runtime that is highly specific to this app.

## Recommended Architecture

Use a hybrid model with three layers:

1. Deterministic notebook runtime
2. Declarative or semi-declarative technique specs
3. Advanced custom code only for exceptional cases

### 1. Deterministic notebook runtime

The notebook remains responsible for:

- selection capture from the rich editor,
- reference management (`D1`, `C1`, `Q1`, `E1`, derived expressions),
- contextual modal rendering,
- guided input collection,
- insertion of the rendered development below the working line,
- bilingual UI chrome,
- execution orchestration.

SymPy remains the mathematical execution engine.

### 2. Declarative or semi-declarative technique specs

Most techniques should not be authored as raw SymPy code.

Instead, the AI or the teacher should generate a structured technique specification such as:

- what kind of technique it is,
- which inputs it needs,
- which notebook reference types it can consume,
- which mathematical operation family it belongs to,
- what concise ES/FR narration it should render,
- how the final result should be displayed.

The app then compiles that spec into notebook-compatible execution behavior.

This should cover most school-level techniques and a large part of calculus.

### 3. Advanced custom code

Keep a teacher-only escape hatch for advanced custom SymPy code.

Use it only when a technique genuinely falls outside the declarative system.

This should be the minority path, not the default path.

## Why This Is Better

Compared with free-form AI-generated code:

- lower failure rate,
- lower retry count,
- better compatibility with notebook references,
- more predictable bilingual output,
- lower review burden,
- lower API cost if API is introduced later,
- easier validation,
- easier scaling to many techniques.

## Recommended Technique Model

### A. Core technique metadata

- `name`
- `nameFr`
- `topicKey`
- `subtopicKey`
- `effectTypeKey`
- `effectDescription`
- `effectDescriptionFr`
- `workedExample`
- `workedExampleFr`

### B. Technique runtime spec

Add a structured runtime section, conceptually like:

```json
{
  "runtimeKind": "substitution",
  "inputSpec": [
    {
      "id": "target_expression",
      "type": "reference_or_selection",
      "required": true
    },
    {
      "id": "replacement_source",
      "type": "reference_or_text",
      "required": true
    }
  ],
  "displaySpec": {
    "introEs": "Aplicando el axioma de sustitucion:",
    "introFr": "En appliquant l axiome de substitution :",
    "stepStyle": "compact",
    "finalResultMode": "result_only"
  },
  "operationSpec": {
    "family": "substitution",
    "mode": "replace_symbol_in_target"
  }
}
```

The exact field names can evolve, but the idea is:

- AI fills the spec,
- the app interprets it,
- the runtime behavior stays controlled by the app.

## Technique Archetypes

These archetypes should cover most of the notebook use cases.

### 1. `selection_only`

Use when the selected expression is enough.

Examples:

- simplify,
- factor,
- expand,
- trig simplify,
- partial simplification,
- derive selected expression,
- integrate selected expression.

### 2. `replace_in_target`

Use when a selected value or assignment replaces a variable inside a target expression.

Examples:

- substitution axiom,
- evaluation at a point,
- replacing a change of variable inside a later step.

### 3. `equation_transform`

Use when a selected equation is transformed while preserving equivalence.

Examples:

- isolate variable,
- multiply both sides,
- divide both sides,
- move term to the other side,
- complete square in an equation.

### 4. `expression_rewrite`

Use when a selected expression is rewritten into another form.

Examples:

- negative exponent rule,
- logarithm property,
- radical rationalization,
- rewriting powers,
- completing square as expression rewrite.

### 5. `apply_reference_to_selection`

Use when a notebook reference is applied to the current selection.

Examples:

- use a prior identity,
- apply a derived expression,
- replace using a referenced equality.

### 6. `selection_plus_parameter`

Use when the student must provide one extra symbolic parameter.

Examples:

- derive with respect to variable,
- integrate with respect to variable,
- solve for variable,
- collect by symbol.

### 7. `selection_plus_choice`

Use when the operation needs a bounded option.

Examples:

- choose expansion strategy,
- choose simplification style,
- choose solve branch mode.

### 8. `custom_teacher_only`

Use only when the technique does not fit the known archetypes.

## Coverage Strategy

### School algebra

Mostly declarative.

Examples:

- substitution,
- simplification,
- expansion,
- factorization,
- solving linear and quadratic equations,
- exponent rules,
- radical rules,
- rational expressions.

### Precalculus

Still mostly declarative or semi-declarative.

Examples:

- function evaluation,
- composition substitutions,
- trigonometric rewrites,
- logarithm and exponential identities.

### Calculus

Hybrid.

Many techniques still fit archetypes:

- derivative of selected expression,
- antiderivative of selected expression,
- evaluate derivative at a point,
- substitute bounds or values,
- change variable in an expression or equation,
- simplify before differentiating or integrating.

Some advanced pedagogical techniques may still require custom code:

- specially narrated chain-rule decompositions,
- multi-step integration tricks,
- custom geometric/analytic display forms,
- domain-specific school formatting rules.

## API Strategy

### Best low-cost strategy

Do not use AI during student runtime.

Use AI only offline for:

- generating new techniques,
- translating ES/FR,
- repairing invalid specs,
- proposing concise school-level narration.

Then validate locally and store the technique.

### Why not use AI in runtime?

- higher cost,
- less deterministic mathematics,
- slower execution,
- more inconsistent outputs,
- unnecessary if SymPy already performs the actual transformation.

## Validation Pipeline

Every generated technique should pass a deterministic preflight before being accepted.

### Stage 1. Static validation

Check:

- valid taxonomy,
- valid UTF-8-visible strings,
- allowed notebook input types,
- valid bilingual labels/placeholders,
- non-redundant output instructions.

### Stage 2. Runtime contract validation

Check:

- `describe(context)` shape or spec shape,
- required inputs align with known input types,
- reference-aware inputs are declared correctly,
- no forbidden assumptions about top-level context keys.

### Stage 3. Fixture execution

Run the technique with canned notebook fixtures such as:

- selection only,
- reference-based input,
- empty optional input,
- target expression with manual text,
- target expression with reference,
- bilingual render expectations.

### Stage 4. Render validation

Check:

- no mojibake in visible output,
- no LaTeX hidden inside plain text fields,
- no accidental duplication of final result,
- concise step structure.

## Migration Plan

### Phase 1

Keep current SymPy custom code support, but improve validation and docs.

### Phase 2

Introduce a first structured runtime spec and 2-3 archetypes:

- `selection_only`
- `replace_in_target`
- `selection_plus_parameter`

### Phase 3

Build a compiler from structured technique specs to notebook runtime behavior.

### Phase 4

Use AI primarily to generate structured specs, not free-form code.

### Phase 5

Reserve raw SymPy code for teacher-only advanced techniques.

## Recommendation

The best solution is not to remove AI, and not to rely on it more blindly.

The best solution is:

- deterministic notebook runtime,
- SymPy as the mathematical engine,
- structured technique generation as the main path,
- advanced custom code only as an escape hatch,
- local validation before acceptance,
- no AI calls during normal student execution.

This gives the best balance of:

- low cost,
- high compatibility,
- high coverage,
- faster catalog growth,
- better long-term maintainability.
