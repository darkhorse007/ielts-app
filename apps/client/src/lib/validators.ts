export const validateEmail = (value: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
};

export const validatePhone = (value: string): boolean => {
  return /^\+?[0-9]{6,20}$/.test(value.trim());
};

export const validatePassword = (value: string): boolean => {
  return value.length >= 8;
};

export const validateBandScore = (value: number): boolean => {
  return value >= 0 && value <= 9 && Number.isInteger(value * 2);
};
