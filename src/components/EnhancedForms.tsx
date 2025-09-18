import { useState, useMemo } from 'react';
import { ethers } from 'ethers';

interface ValidationRule {
  test: (value: string) => boolean;
  message: string;
}

interface FormField {
  value: string;
  rules: ValidationRule[];
  touched: boolean;
}

export const useFormValidation = (initialFields: Record<string, FormField>) => {
  const [fields, setFields] = useState(initialFields);

  const errors = useMemo(() => {
    const result: Record<string, string> = {};
    Object.entries(fields).forEach(([key, field]) => {
      if (field.touched) {
        const failedRule = field.rules.find(rule => !rule.test(field.value));
        if (failedRule) {
          result[key] = failedRule.message;
        }
      }
    });
    return result;
  }, [fields]);

  const isValid = useMemo(() => {
    return Object.keys(errors).length === 0 && 
           Object.values(fields).every(field => field.touched);
  }, [errors, fields]);

  const updateField = (name: string, value: string) => {
    setFields(prev => ({
      ...prev,
      [name]: { ...prev[name], value, touched: true }
    }));
  };

  const resetFields = () => {
    setFields(initialFields);
  };

  return { fields, errors, isValid, updateField, resetFields };
};

// Règles de validation communes
export const validationRules = {
  required: (message = 'Ce champ est requis'): ValidationRule => ({
    test: (value) => value.trim().length > 0,
    message
  }),
  
  ethereumAddress: (message = 'Adresse Ethereum invalide'): ValidationRule => ({
    test: (value) => ethers.utils.isAddress(value),
    message
  }),
  
  positiveNumber: (message = 'Doit être un nombre positif'): ValidationRule => ({
    test: (value) => {
      const num = parseFloat(value);
      return !isNaN(num) && num > 0;
    },
    message
  }),
  
  minValue: (min: number, message?: string): ValidationRule => ({
    test: (value) => parseFloat(value) >= min,
    message: message || `Valeur minimale: ${min}`
  }),
  
  maxDecimals: (decimals: number, message?: string): ValidationRule => ({
    test: (value) => {
      const parts = value.split('.');
      return parts.length <= 1 || parts[1].length <= decimals;
    },
    message: message || `Maximum ${decimals} décimales`
  })
};

// Composant Input amélioré
export const ValidatedInput: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: 'text' | 'number' | 'email';
  placeholder?: string;
  icon?: React.ReactNode;
  suffix?: string;
}> = ({ label, value, onChange, error, type = 'text', placeholder, icon, suffix }) => {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            {icon}
          </div>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`
            w-full px-3 py-2 border rounded-lg transition-colors
            ${icon ? 'pl-10' : ''}
            ${suffix ? 'pr-16' : ''}
            ${error 
              ? 'border-red-500 bg-red-50 dark:bg-red-900/20 focus:ring-red-500' 
              : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-blue-500'
            }
            focus:ring-2 focus:border-transparent
            text-gray-900 dark:text-gray-100
          `}
        />
        {suffix && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <span className="text-gray-500 text-sm">{suffix}</span>
          </div>
        )}
      </div>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
          <span>⚠️</span>
          {error}
        </p>
      )}
    </div>
  );
};

// Templates de streams prédéfinis
export const StreamTemplates = {
  salary: {
    name: '💼 Salaire mensuel',
    duration: '43200', // 30 jours en minutes
    description: 'Stream de salaire sur 30 jours'
  },
  freelance: {
    name: '🎯 Projet freelance',
    duration: '10080', // 7 jours en minutes
    description: 'Paiement projet sur 7 jours'
  },
  investment: {
    name: '📈 Investissement',
    duration: '525600', // 365 jours en minutes
    description: 'Stream d\'investissement annuel'
  },
  grant: {
    name: '🏛️ Subvention',
    duration: '129600', // 90 jours en minutes
    description: 'Versement de subvention trimestriel'
  }
};

export const TemplateSelector: React.FC<{
  onSelect: (template: typeof StreamTemplates[keyof typeof StreamTemplates]) => void;
}> = ({ onSelect }) => {
  return (
    <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
      <div className="text-sm font-medium mb-2 col-span-2">Templates rapides:</div>
      {Object.entries(StreamTemplates).map(([key, template]) => (
        <button
          key={key}
          onClick={() => onSelect(template)}
          className="text-left p-3 bg-white dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
        >
          <div className="font-medium text-sm">{template.name}</div>
          <div className="text-xs text-gray-500">{template.description}</div>
        </button>
      ))}
    </div>
  );
};