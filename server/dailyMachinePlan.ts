const MACHINE_CODE_PATTERN = /^F(?:0[1-9]|[12][0-9]|30)$/;

export function isValidMachineCode(machineId: string): boolean {
  return MACHINE_CODE_PATTERN.test(machineId);
}

export function getFactoryDate(
  date: Date = new Date(),
  timeZone = process.env.FACTORY_TIME_ZONE?.trim() || 'Europe/Lisbon'
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function canStartMachine(
  machineId: string,
  plannedMachineIds: readonly string[],
  hasActiveDowntime: boolean
): boolean {
  return hasActiveDowntime || plannedMachineIds.includes(machineId);
}
