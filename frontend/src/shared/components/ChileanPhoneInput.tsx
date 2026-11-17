import type { InputHTMLAttributes } from 'react';

/** Store the full number for the API; edit only the nine national digits. */
export function nationalPhoneDigits(value: string) {
  const digits = value.replace(/\D/g, '');
  return (digits.startsWith('56') && (value.trim().startsWith('+') || digits.length > 9)
    ? digits.slice(2) : digits).slice(0, 9);
}

export function ChileanPhoneInput({ value, onChange, pattern = '9[0-9]{8}', ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string; onChange: (value: string) => void;
}) {
  return <span className="chilean-phone-input">
    <span className="chilean-phone-prefix" aria-hidden="true">+56</span>
    <input {...props} type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="912345678"
      pattern={pattern} value={nationalPhoneDigits(value)} onChange={event => {
        const digits = nationalPhoneDigits(event.target.value);
        onChange(digits ? `+56${digits}` : '');
      }} />
  </span>;
}
