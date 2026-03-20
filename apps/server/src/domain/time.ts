export const nowIso = (): string => new Date().toISOString();

export const addSeconds = (iso: string, seconds: number): string => {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
};

export const isPast = (iso: string): boolean => {
  return new Date(iso).getTime() <= Date.now();
};
