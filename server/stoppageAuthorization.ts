export interface StoppageSession {
  role: 'admin' | 'operator';
  canClose?: boolean;
}

export function canWriteStoppage(
  session: StoppageSession | undefined,
  pinAuthorized: boolean
): boolean {
  const sessionCanClose =
    session?.role === 'admin' || (session?.role === 'operator' && session.canClose === true);
  return sessionCanClose || pinAuthorized;
}

export function matchesActiveStoppageClosure(
  recordId: string,
  startTimestamp: number,
  activeStartTimestamp: number | undefined
): boolean {
  return recordId.startsWith('stop-') && activeStartTimestamp === startTimestamp;
}
