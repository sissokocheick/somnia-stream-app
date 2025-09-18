// utils/exportData.tsx
import React, { useState } from 'react';

// Interface pour les données de stream
interface StreamInfo {
  streamId: string;
  sender: string;
  recipient: string;
  deposit: string;
  ratePerSecond: string;
  remaining: string;
  paused: boolean;
  startTime: number;
  stopTime: number;
  progress: number;
  withdrawable: string;
  totalWithdrawn: string;
  isActive: boolean;
}

export interface ExportOptions {
  format: 'csv' | 'json';
  fields: string[];
  includeMetrics?: boolean;
}

// Fonction d'export simplifiée (sans PDF pour éviter les problèmes)
export const exportStreams = async (streams: StreamInfo[], options: ExportOptions): Promise<void> => {
  switch (options.format) {
    case 'csv':
      return exportToCSV(streams, options.fields);
    case 'json':
      return exportToJSON(streams, options);
    default:
      throw new Error('Format non supporté');
  }
};

const exportToCSV = (streams: StreamInfo[], fields: string[]): void => {
  const fieldMapping: Record<string, keyof StreamInfo> = {
    'ID': 'streamId',
    'Expéditeur': 'sender',
    'Destinataire': 'recipient',
    'Montant': 'deposit',
    'Taux/sec': 'ratePerSecond',
    'Progression': 'progress',
    'Retirable': 'withdrawable',
    'Statut': 'isActive',
    'En pause': 'paused',
    'Date début': 'startTime'
  };

  const csvHeaders = fields.join(',');
  const csvRows = streams.map(stream => 
    fields.map(field => {
      const key = fieldMapping[field];
      let value = stream[key];
      
      // Formatage spécial pour certains champs
      if (field === 'Date début') {
        value = new Date(Number(value) * 1000).toLocaleDateString();
      } else if (field === 'Progression') {
        value = `${Number(value).toFixed(2)}%`;
      } else if (field === 'Statut') {
        value = stream.isActive ? 'Actif' : 'Terminé';
      } else if (field === 'En pause') {
        value = stream.paused ? 'Oui' : 'Non';
      }
      
      return `"${value}"`;
    }).join(',')
  );

  const csvContent = [csvHeaders, ...csvRows].join('\n');
  downloadFile(csvContent, 'somnia-streams.csv', 'text/csv');
};

const exportToJSON = (streams: StreamInfo[], options: ExportOptions): void => {
  const data = {
    exportDate: new Date().toISOString(),
    totalStreams: streams.length,
    streams: streams.map(stream => ({
      ...stream,
      startTimeFormatted: new Date(stream.startTime * 1000).toISOString(),
      stopTimeFormatted: new Date(stream.stopTime * 1000).toISOString()
    })),
    ...(options.includeMetrics && {
      metrics: calculateMetrics(streams)
    })
  };

  const jsonContent = JSON.stringify(data, null, 2);
  downloadFile(jsonContent, 'somnia-streams.json', 'application/json');
};

const calculateMetrics = (streams: StreamInfo[]) => {
  return {
    totalStreams: streams.length,
    activeStreams: streams.filter(s => s.isActive && !s.paused).length,
    pausedStreams: streams.filter(s => s.paused).length,
    completedStreams: streams.filter(s => !s.isActive).length,
    totalAmount: streams.reduce((sum, s) => sum + parseFloat(s.deposit), 0),
    averageAmount: streams.length > 0 ? streams.reduce((sum, s) => sum + parseFloat(s.deposit), 0) / streams.length : 0
  };
};

const downloadFile = (content: string, filename: string, contentType: string): void => {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const shortenAddress = (address: string): string => {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

// Composant pour l'interface d'export - VERSION SIMPLIFIÉE
export const ExportDialog: React.FC<{
  isOpen: boolean;
  streams: StreamInfo[];
  onClose: () => void;
}> = ({ isOpen, streams, onClose }) => {
  const [selectedFormat, setSelectedFormat] = useState<'csv' | 'json'>('csv');
  const [includeMetrics, setIncludeMetrics] = useState(true);

  // Champs disponibles simplifiés
  const [selectedFields, setSelectedFields] = useState([
    'ID', 'Expéditeur', 'Destinataire', 'Montant', 'Progression', 'Statut'
  ]);

  const availableFields = [
    'ID', 'Expéditeur', 'Destinataire', 'Montant', 'Taux/sec', 
    'Progression', 'Retirable', 'Statut', 'En pause', 'Date début'
  ];

  const handleExport = async () => {
    try {
      const options: ExportOptions = {
        format: selectedFormat,
        fields: selectedFields,
        includeMetrics
      };
      await exportStreams(streams, options);
      onClose();
    } catch (error) {
      console.error('Erreur lors de l\'export:', error);
      alert('Erreur lors de l\'export des données');
    }
  };

  const toggleField = (field: string) => {
    setSelectedFields(prev => 
      prev.includes(field) 
        ? prev.filter(f => f !== field)
        : [...prev, field]
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-semibold mb-4">Exporter les données</h3>
        
        {/* Format */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Format</label>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedFormat('csv')}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${
                selectedFormat === 'csv'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              CSV
            </button>
            <button
              onClick={() => setSelectedFormat('json')}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${
                selectedFormat === 'json'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              JSON
            </button>
          </div>
        </div>

        {/* Champs à inclure */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Champs à inclure</label>
          <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
            {availableFields.map(field => (
              <label key={field} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={selectedFields.includes(field)}
                  onChange={() => toggleField(field)}
                  className="rounded"
                />
                <span className="text-sm">{field}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Options */}
        <div className="mb-6">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={includeMetrics}
              onChange={(e) => setIncludeMetrics(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Inclure les métriques</span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg"
          >
            Annuler
          </button>
          <button
            onClick={handleExport}
            disabled={selectedFields.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Exporter ({streams.length} streams)
          </button>
        </div>
      </div>
    </div>
  );
};