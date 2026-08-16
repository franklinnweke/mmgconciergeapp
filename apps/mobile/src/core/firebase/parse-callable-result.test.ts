import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { CallableContractError, parseCallableResult } from './parse-callable-result';

const resultSchema = z.object({
  requestId: z.string(),
  result: z.object({ status: z.literal('submitted'), version: z.number().int() }),
});

describe('parseCallableResult', () => {
  it('returns the parsed payload when the response matches its contract', () => {
    const parsed = parseCallableResult(
      resultSchema,
      { requestId: 'req-1', result: { status: 'submitted', version: 2 } },
      'submitOwnerVerification',
    );

    expect(parsed).toEqual({ requestId: 'req-1', result: { status: 'submitted', version: 2 } });
  });

  it('throws instead of letting a partial payload look like a success', () => {
    expect(() =>
      parseCallableResult(resultSchema, { requestId: 'req-1' }, 'submitOwnerVerification'),
    ).toThrowError(CallableContractError);
  });

  it('throws when the payload is missing entirely', () => {
    expect(() => parseCallableResult(resultSchema, undefined, 'completeOwnerProfile')).toThrowError(
      CallableContractError,
    );
  });

  it('names the command and the failing paths so the failure is diagnosable', () => {
    try {
      parseCallableResult(
        resultSchema,
        { requestId: 'req-1', result: { status: 'approved', version: 'two' } },
        'submitOwnerVerification',
      );
      expect.unreachable('expected a contract error');
    } catch (error) {
      expect(error).toBeInstanceOf(CallableContractError);
      const contractError = error as CallableContractError;
      expect(contractError.commandName).toBe('submitOwnerVerification');
      expect(contractError.message).toContain('submitOwnerVerification');
      expect(contractError.issues.join('\n')).toContain('result.status');
      expect(contractError.issues.join('\n')).toContain('result.version');
    }
  });

  it('does not report a raw payload value in the error, only the path', () => {
    // Callable payloads carry PII. The error is logged and surfaced in UI copy,
    // so it must describe the shape mismatch without echoing the data.
    try {
      parseCallableResult(
        resultSchema,
        { requestId: 'req-1', result: { status: 'submitted', version: 'oga@example.com' } },
        'completeOwnerProfile',
      );
      expect.unreachable('expected a contract error');
    } catch (error) {
      const contractError = error as CallableContractError;
      expect(contractError.issues.join('\n')).not.toContain('oga@example.com');
      expect(contractError.message).not.toContain('oga@example.com');
    }
  });

  it('labels a root-level mismatch rather than emitting an empty path', () => {
    try {
      parseCallableResult(resultSchema, 'not-an-object', 'submitOwnerVerification');
      expect.unreachable('expected a contract error');
    } catch (error) {
      expect((error as CallableContractError).issues[0]).toMatch(/^<root>:/);
    }
  });
});
