import { type InputHTMLAttributes } from 'react';

export interface RadioOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface RadioGroupProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'size'> {
  name: string;
  options: RadioOption[];
  value?: string;
  onChange?: (value: string) => void;
  label?: string;
  error?: string;
  helperText?: string;
  orientation?: 'horizontal' | 'vertical';
  size?: 'small' | 'medium' | 'large';
}

export const RadioGroup = ({
  name,
  options,
  value,
  onChange,
  label,
  error,
  helperText,
  orientation = 'vertical',
  size = 'medium',
  disabled,
  className = '',
  ...props
}: RadioGroupProps) => {
  const sizeClasses = {
    small: 'w-3 h-3',
    medium: 'w-4 h-4',
    large: 'w-5 h-5',
  };

  const labelSizeClasses = {
    small: 'text-sm',
    medium: 'text-base',
    large: 'text-lg',
  };

  const handleChange = (optionValue: string) => {
    if (onChange) {
      onChange(optionValue);
    }
  };

  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {label}
        </label>
      )}
      <div
        className={`
          flex gap-4
          ${orientation === 'vertical' ? 'flex-col' : 'flex-row flex-wrap'}
        `.trim().replace(/\s+/g, ' ')}
      >
        {options.map((option) => {
          const isDisabled = disabled || option.disabled;
          const isChecked = value === option.value;

          return (
            <label
              key={option.value}
              className={`
                flex items-start gap-2 cursor-pointer
                ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80'}
              `.trim().replace(/\s+/g, ' ')}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={isChecked}
                disabled={isDisabled}
                onChange={() => handleChange(option.value)}
                className={`
                  ${sizeClasses[size]}
                  mt-0.5
                  text-blue-600 dark:text-blue-400 border-gray-300 dark:border-gray-600
                  focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
                  disabled:cursor-not-allowed
                  ${error ? 'border-red-500 dark:border-red-400' : ''}
                `.trim().replace(/\s+/g, ' ')}
                {...props}
              />
              <div className="flex flex-col">
                <span className={`${labelSizeClasses[size]} font-medium text-gray-900 dark:text-gray-100`}>
                  {option.label}
                </span>
                {option.description && (
                  <span className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {option.description}
                  </span>
                )}
              </div>
            </label>
          );
        })}
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      {!error && helperText && (
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{helperText}</p>
      )}
    </div>
  );
};
