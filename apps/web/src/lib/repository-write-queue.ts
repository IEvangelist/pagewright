"use client";

import { useCallback, useRef } from "react";

interface RepositoryWriteResult<T> {
  value: T;
  headSha?: string | null;
}

type RepositoryWrite<T> = (
  expectedHeadSha: string,
) => Promise<RepositoryWriteResult<T>>;

export class RepositoryConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryConflictError";
  }
}

/**
 * Serializes commits initiated by one editor and advances their shared optimistic-concurrency token.
 * The queue survives failed writes so a reload or explicit overwrite can still be attempted.
 */
export function useRepositoryWriteQueue(initialHeadSha: string) {
  const headShaRef = useRef(initialHeadSha);
  const tailRef = useRef<Promise<void>>(Promise.resolve());

  return useCallback(<T,>(write: RepositoryWrite<T>): Promise<T> => {
    const operation = tailRef.current.then(async () => {
      const result = await write(headShaRef.current);
      if (result.headSha) headShaRef.current = result.headSha;
      return result.value;
    });

    tailRef.current = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }, []);
}
