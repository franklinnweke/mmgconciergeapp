/**
 * Thrown when a callable returns a payload that does not match its contract.
 *
 * The wire format is not trustworthy just because the call resolved: a deployed
 * function can be a version ahead of the app, and a partial or reshaped payload
 * cast with `as` would surface in the UI as a confident success. Failing here
 * keeps the honesty rule — never claim a state change that did not happen.
 */
export class CallableContractError extends Error {
  constructor(
    readonly commandName: string,
    readonly issues: readonly string[],
  ) {
    super(`${commandName} returned a response that did not match its contract.`);
    this.name = 'CallableContractError';
  }
}

/**
 * Structural stand-in for a Zod schema.
 *
 * Deliberately not `z.ZodTypeAny`: this workspace has no direct `zod`
 * dependency, so `import { z } from 'zod'` here resolves to the v3 copy hoisted
 * by the Expo CLI, while `@mmg/contracts` schemas are v4. Matching on the shape
 * we actually use keeps this helper working across both.
 */
export type ResultSchema<Output> = {
  safeParse(data: unknown):
    | { success: true; data: Output }
    | {
        success: false;
        error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] };
      };
};

/** Parses a callable response against its result schema. */
export function parseCallableResult<Output>(
  schema: ResultSchema<Output>,
  data: unknown,
  commandName: string,
): Output {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new CallableContractError(
      commandName,
      // Path and message only. Issue values can carry PII, and this message is
      // logged and shown to the user.
      parsed.error.issues.map(
        (issue) => `${issue.path.map(String).join('.') || '<root>'}: ${issue.message}`,
      ),
    );
  }
  return parsed.data;
}
