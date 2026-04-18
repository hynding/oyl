import { forwardRef, type TextareaHTMLAttributes } from 'react';

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> {
  label?: string;
  error?: string;
  helperText?: string;
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
  resize?: 'none' | 'vertical' | 'horizontal' | 'both';
  showCharCount?: boolean;
  maxLength?: number;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({
    label,
    error,
    helperText,
    size = 'medium',
    fullWidth = false,
    resize = 'vertical',
    showCharCount = false,
    maxLength,
    className = '',
    value = '',
    ...props
  }, ref) => {
    const sizeClasses = {
      small: 'px-2 py-1 text-sm',
      medium: 'px-3 py-2 text-base',
      large: 'px-4 py-3 text-lg',
    };

    const resizeClasses = {
      none: 'resize-none',
      vertical: 'resize-y',
      horizontal: 'resize-x',
      both: 'resize',
    };

    const textareaClasses = `
      ${sizeClasses[size]}
      ${fullWidth ? 'w-full' : ''}
      ${resizeClasses[resize]}
      bg-white dark:bg-gray-800
      text-gray-900 dark:text-gray-100
      border rounded-md
      focus:outline-none focus:ring-2
      disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed
      placeholder:text-gray-400 dark:placeholder:text-gray-500
      ${error
        ? 'border-red-500 dark:border-red-400 focus:ring-red-500 dark:focus:ring-red-400 focus:border-red-500 dark:focus:border-red-400'
        : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400'
      }
      ${className}
    `.trim().replace(/\s+/g, ' ');

    const currentLength = typeof value === 'string' ? value.length : String(value).length;

    return (
      <div className={fullWidth ? 'w-full' : ''}>
        {label && (
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={textareaClasses}
          value={value}
          maxLength={maxLength}
          {...props}
        />
        <div className="flex justify-between items-start mt-1">
          <div className="flex-1">
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
            {!error && helperText && (
              <p className="text-sm text-gray-500 dark:text-gray-400">{helperText}</p>
            )}
          </div>
          {showCharCount && (
            <p className="text-sm text-gray-500 dark:text-gray-400 ml-2 flex-shrink-0">
              {currentLength}
              {maxLength && `/${maxLength}`}
            </p>
          )}
        </div>
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
