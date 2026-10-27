import type { ListRenterRentalRequestsResult } from '@mmg/contracts/rental-request';

/** One user/session owns one in-flight read. A mutation queues a fresh read. */
export function createRentalRequestRefresh(options: {
  load(): Promise<ListRenterRentalRequestsResult>;
  apply(result: ListRenterRentalRequestsResult): void;
  failed(error: unknown): void;
}) {
  let active = true;
  let pending: Promise<void> | null = null;
  let readAgain = false;

  async function drain() {
    let failure: unknown;
    do {
      readAgain = false;
      try {
        const result = await options.load();
        if (!active) return;
        options.apply(result);
        failure = undefined;
      } catch (error) {
        if (!active) return;
        failure = error;
        options.failed(error);
      }
    } while (active && readAgain);
    if (failure) throw failure;
  }

  return {
    refresh(afterMutation = false): Promise<void> {
      if (!active) return Promise.resolve();
      if (pending) {
        readAgain ||= afterMutation;
        return pending;
      }
      pending = drain().finally(() => { pending = null; });
      return pending;
    },
    dispose() { active = false; readAgain = false; },
  };
}
