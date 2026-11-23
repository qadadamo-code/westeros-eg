/** Runs async jobs a few at a time: a bulk save finishes fast without opening hundreds of requests at once. */
export async function inChunks<T>(list: T[], fn: (x: T) => Promise<unknown>, size = 6) {
  for (let i = 0; i < list.length; i += size) await Promise.all(list.slice(i, i + size).map(fn));
}
