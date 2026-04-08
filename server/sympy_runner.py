import json
import sys

from sympy import *  # noqa: F403
from sympy.parsing.latex import parse_latex
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)


TRANSFORMATIONS = standard_transformations + (
    implicit_multiplication_application,
    convert_xor,
)

SAFE_BUILTINS = {
    "abs": abs,
    "all": all,
    "any": any,
    "bool": bool,
    "dict": dict,
    "enumerate": enumerate,
    "float": float,
    "int": int,
    "len": len,
    "list": list,
    "max": max,
    "min": min,
    "range": range,
    "round": round,
    "set": set,
    "str": str,
    "sum": sum,
    "tuple": tuple,
    "zip": zip,
}


def build_execution_globals():
    def parse_math(value, local_dict=None):
        raw = str(value or "").strip()
        if not raw:
            raise ValueError("A mathematical input string is required.")

        try:
            return parse_expr(
                raw,
                transformations=TRANSFORMATIONS,
                evaluate=True,
                local_dict=local_dict or {},
            )
        except Exception:
            return parse_latex(raw)

    shared = {
        "__builtins__": SAFE_BUILTINS,
        "parse_expr": lambda value, local_dict=None: parse_expr(
            str(value or "").strip(),
            transformations=TRANSFORMATIONS,
            evaluate=True,
            local_dict=local_dict or {},
        ),
        "parse_math": parse_math,
        "parse_latex": parse_latex,
        "sympify": sympify,
        "latex": latex,
        "simplify": simplify,
        "factor": factor,
        "expand": expand,
        "collect": collect,
        "cancel": cancel,
        "apart": apart,
        "together": together,
        "expand_trig": expand_trig,
        "trigsimp": trigsimp,
        "powsimp": powsimp,
        "ratsimp": ratsimp,
        "sqrtdenest": sqrtdenest,
        "solve": solve,
        "Eq": Eq,
    }

    for name, value in globals().items():
        if name.startswith("_"):
            continue
        shared.setdefault(name, value)

    return shared


def normalize_sympy_value(value):
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (list, tuple)):
        return [normalize_sympy_value(item) for item in value]
    if isinstance(value, dict):
        return {str(key): normalize_sympy_value(item) for key, item in value.items()}

    try:
        return {
            "type": type(value).__name__,
            "text": str(value),
            "latex": latex(value),
        }
    except Exception:
        return str(value)


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    mode = str(payload.get("mode") or "transform").strip() or "transform"
    transformation_code = str(payload.get("sympyTransformation") or "").strip()
    if not transformation_code:
        raise ValueError("sympyTransformation is required.")

    context = {
        "selected_text": str(payload.get("selectedText") or "").strip(),
        "selected_html": str(payload.get("selectedHtml") or "").strip(),
        "locale": str(payload.get("locale") or "es").strip() or "es",
        "options": payload.get("options") if isinstance(payload.get("options"), dict) else {},
    }

    execution_scope = build_execution_globals()
    exec(transformation_code, execution_scope, execution_scope)

    if mode == "describe":
        describe = execution_scope.get("describe")
        behavior = execution_scope.get("NOTEBOOK_BEHAVIOR")
        if callable(describe):
            try:
                described = describe(context)
            except TypeError:
                described = describe()
        else:
            described = behavior

        sys.stdout.write(json.dumps({
            "ok": True,
            "behavior": normalize_sympy_value(described or {}),
        }))
        return

    transform = execution_scope.get("transform")
    if not callable(transform):
        raise ValueError('The SymPy transformation must define a callable "transform(context)".')

    result = transform(context)
    normalized = normalize_sympy_value(result)

    sys.stdout.write(json.dumps({
        "ok": True,
        "result": normalized,
    }))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        sys.stdout.write(json.dumps({
            "ok": False,
            "error": str(error),
        }))
        sys.exit(1)
