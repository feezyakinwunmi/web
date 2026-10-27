// web/src/lib/banks.ts (copy of app/constants/banks.ts — keep in sync)
// Single source of truth for supported banks. `code` is the Paystack bank code
// (used by the verify-bank / setup-subaccount edge functions); `value` is what is
// stored in vendors.bank_name, so existing values must never change.

export interface Bank {
  label: string;
  value: string;
  code: string;
}

export const BANKS: Bank[] = [
  { label: 'Access Bank', value: 'access', code: '044' },
  { label: 'Citibank', value: 'citibank', code: '023' },
  { label: 'Ecobank', value: 'ecobank', code: '050' },
  { label: 'Fidelity Bank', value: 'fidelity', code: '070' },
  { label: 'First Bank', value: 'first', code: '011' },
  { label: 'FCMB', value: 'fcmb', code: '214' },
  { label: 'GTBank', value: 'gtb', code: '058' },
  { label: 'Heritage Bank', value: 'heritage', code: '030' },
  { label: 'Keystone Bank', value: 'keystone', code: '082' },
  { label: 'Kuda Bank', value: 'kuda', code: '50211' },
  { label: 'Moniepoint', value: 'moniepoint', code: '50515' },
  { label: 'OPay', value: 'opay', code: '999992' },
  { label: 'PalmPay', value: 'palmpay', code: '999991' },
  { label: 'Polaris Bank', value: 'polaris', code: '076' },
  { label: 'Stanbic IBTC', value: 'stanbic', code: '221' },
  { label: 'Standard Chartered', value: 'standard', code: '068' },
  { label: 'Sterling Bank', value: 'sterling', code: '232' },
  { label: 'UBA', value: 'uba', code: '033' },
  { label: 'Union Bank', value: 'union', code: '032' },
  { label: 'Wema Bank', value: 'wema', code: '035' },
  { label: 'Zenith Bank', value: 'zenith', code: '057' },
];

export const findBank = (valueOrLabel?: string | null): Bank | undefined => {
  if (!valueOrLabel) return undefined;
  const key = valueOrLabel.trim().toLowerCase();
  return BANKS.find(b => b.value === key || b.label.toLowerCase() === key);
};
