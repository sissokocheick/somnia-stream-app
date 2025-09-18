import React from 'react';

type ErrorAlertProps = {
  error: string;
  onClose: () => void;
};

export const ErrorAlert = ({ error, onClose }: ErrorAlertProps) => (
  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center">
        <span className="text-red-600 dark:text-red-400 mr-2">⚠️</span>
        <span className="text-red-800 dark:text-red-200 text-sm">{error}</span>
      </div>
      <button onClick={onClose} className="text-red-600 dark:text-red-400 hover:text-red-800">
        ×
      </button>
    </div>
  </div>
);