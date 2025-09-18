// components/Dashboard.tsx
import React, { useMemo } from 'react';

interface StreamInfo {
  streamId: string;
  sender: string;
  recipient: string;
  deposit: string;
  startTime: number;
  isActive: boolean;
  paused: boolean;
}

interface DashboardProps {
  streams: StreamInfo[];
  account: string;
  tokenSymbol: string;
}

export const Dashboard: React.FC<DashboardProps> = ({ streams, account, tokenSymbol }) => {
  const metrics = useMemo(() => {
    const sent = streams.filter(s => s.sender.toLowerCase() === account.toLowerCase());
    const received = streams.filter(s => s.recipient.toLowerCase() === account.toLowerCase());
    
    const totalSent = sent.reduce((sum, s) => sum + parseFloat(s.deposit), 0);
    const totalReceived = received.reduce((sum, s) => sum + parseFloat(s.deposit), 0);
    
    const activeStreams = streams.filter(s => s.isActive && !s.paused);
    const pausedStreams = streams.filter(s => s.paused);
    const completedStreams = streams.filter(s => !s.isActive);

    return {
      totalSent,
      totalReceived,
      counts: {
        total: streams.length,
        active: activeStreams.length,
        paused: pausedStreams.length,
        completed: completedStreams.length,
        sent: sent.length,
        received: received.length
      }
    };
  }, [streams, account]);

  // Données pour l'historique simple
  const recentActivity = useMemo(() => {
    return streams
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, 5);
  }, [streams]);

  return (
    <div className="space-y-6">
      {/* Métriques principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total envoyé"
          value={`${metrics.totalSent.toFixed(2)} ${tokenSymbol}`}
          icon="📤"
          color="blue"
        />
        <MetricCard
          title="Total reçu"
          value={`${metrics.totalReceived.toFixed(2)} ${tokenSymbol}`}
          icon="📥"
          color="green"
        />
        <MetricCard
          title="Streams actifs"
          value={metrics.counts.active.toString()}
          icon="🔄"
          color="purple"
        />
        <MetricCard
          title="En pause"
          value={metrics.counts.paused.toString()}
          icon="⏸️"
          color="orange"
        />
      </div>

      {/* Vue d'ensemble des statuts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Répartition des streams */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Répartition des streams</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 bg-green-500 rounded-full"></div>
                <span>Actifs</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{metrics.counts.active}</span>
                <div className="w-20 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-500 h-2 rounded-full"
                    style={{ width: `${(metrics.counts.active / metrics.counts.total) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 bg-yellow-500 rounded-full"></div>
                <span>En pause</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{metrics.counts.paused}</span>
                <div className="w-20 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-yellow-500 h-2 rounded-full"
                    style={{ width: `${(metrics.counts.paused / metrics.counts.total) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 bg-gray-500 rounded-full"></div>
                <span>Terminés</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{metrics.counts.completed}</span>
                <div className="w-20 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-gray-500 h-2 rounded-full"
                    style={{ width: `${(metrics.counts.completed / metrics.counts.total) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Activité récente */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Activité récente</h3>
          <div className="space-y-3">
            {recentActivity.length > 0 ? (
              recentActivity.map((stream) => (
                <div key={stream.streamId} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div>
                    <div className="font-medium text-sm">Stream #{stream.streamId}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      {new Date(stream.startTime * 1000).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-sm">{parseFloat(stream.deposit).toFixed(2)} {tokenSymbol}</div>
                    <div className={`text-xs px-2 py-1 rounded-full ${
                      stream.paused ? 'bg-yellow-100 text-yellow-800' :
                      stream.isActive ? 'bg-green-100 text-green-800' : 
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {stream.paused ? 'En pause' : stream.isActive ? 'Actif' : 'Terminé'}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                <div className="text-2xl mb-2">📊</div>
                <div>Aucune activité récente</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Statistiques détaillées */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4">Statistiques détaillées</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{metrics.counts.sent}</div>
            <div className="text-sm text-gray-600">Streams envoyés</div>
          </div>
          <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{metrics.counts.received}</div>
            <div className="text-sm text-gray-600">Streams reçus</div>
          </div>
          <div className="text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">
              {metrics.counts.total > 0 ? ((metrics.counts.active / metrics.counts.total) * 100).toFixed(0) : 0}%
            </div>
            <div className="text-sm text-gray-600">Taux d'activité</div>
          </div>
          <div className="text-center p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
            <div className="text-2xl font-bold text-orange-600">
              {metrics.counts.total > 0 ? (metrics.totalSent / metrics.counts.sent || 0).toFixed(2) : '0.00'}
            </div>
            <div className="text-sm text-gray-600">Montant moyen</div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface MetricCardProps {
  title: string;
  value: string;
  icon: string;
  color: 'blue' | 'green' | 'purple' | 'orange';
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, icon, color }) => {
  const colorClasses = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600', 
    purple: 'from-purple-500 to-purple-600',
    orange: 'from-orange-500 to-orange-600'
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{title}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{value}</p>
        </div>
        <div className={`w-12 h-12 bg-gradient-to-r ${colorClasses[color]} rounded-lg flex items-center justify-center text-white text-xl`}>
          {icon}
        </div>
      </div>
    </div>
  );
};