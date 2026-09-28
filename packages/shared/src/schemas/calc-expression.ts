import { parse, type MathNode } from 'mathjs';

export const ALLOWED_CALC_FUNCTIONS = ['round', 'min', 'max', 'abs', 'floor', 'ceil'] as const;

export function validateCalcExpression(
  expression: string,
  fieldKeys: readonly string[],
): { ok: true } | { ok: false; message: string } {
  try {
    const node = parse(expression);
    const fieldKeySet = new Set(fieldKeys);
    let firstError: { ok: false; message: string } | null = null;

    node.traverse((n: MathNode, path: string, parent: MathNode | null) => {
      // Stop processing if we've already found an error
      if (firstError) return;

      const nodeType = n.type;

      if (nodeType === 'ConstantNode') {
        const constantNode = n as unknown as { value: unknown };
        if (typeof constantNode.value !== 'number') {
          firstError = {
            ok: false,
            message: `Unsupported syntax: ${nodeType}`,
          };
        }
        return;
      }

      if (nodeType === 'SymbolNode') {
        const symbolNode = n as unknown as { name: string };
        const name = symbolNode.name;

        // Check if this symbol is the function name of a parent FunctionNode
        if (parent?.type === 'FunctionNode' && path === 'fn') {
          return; // This is a function name, allowed
        }

        // Otherwise, it must be in fieldKeys
        if (!fieldKeySet.has(name)) {
          firstError = {
            ok: false,
            message: `Unknown symbol "${name}"`,
          };
        }
        return;
      }

      if (nodeType === 'OperatorNode') {
        const operatorNode = n as unknown as { fn: string };
        const allowedOps = [
          'add',
          'subtract',
          'multiply',
          'divide',
          'pow',
          'mod',
          'unaryMinus',
          'unaryPlus',
        ];

        if (!allowedOps.includes(operatorNode.fn)) {
          firstError = {
            ok: false,
            message: `Unsupported syntax: ${nodeType}`,
          };
        }
        return;
      }

      if (nodeType === 'ParenthesisNode') {
        return; // Allowed
      }

      if (nodeType === 'FunctionNode') {
        const funcNode = n as unknown as { fn?: { type?: string; name?: string } };
        const fnNode = funcNode.fn;

        // fn should be a SymbolNode with a name in ALLOWED_CALC_FUNCTIONS
        if (fnNode?.type === 'SymbolNode') {
          const fnName = fnNode.name;
          if (!(ALLOWED_CALC_FUNCTIONS as readonly string[]).includes(fnName ?? '')) {
            firstError = {
              ok: false,
              message: `Function "${fnName}" is not allowed`,
            };
          }
          return;
        }

        // If fn is not a SymbolNode, it's unsupported
        firstError = {
          ok: false,
          message: `Unsupported syntax: ${nodeType}`,
        };
        return;
      }

      // Any other node type is not supported
      firstError = {
        ok: false,
        message: `Unsupported syntax: ${nodeType}`,
      };
    });

    if (firstError) {
      return firstError;
    }

    return { ok: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      message: `Invalid expression: ${errorMessage}`,
    };
  }
}
