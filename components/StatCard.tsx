import React from 'react';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  colorClass: string;
  trend?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ title, value, icon, colorClass, trend }) => {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 flex items-start justify-between hover:border-slate-600 transition-all shadow-lg relative overflow-hidden group">
      <div className={`absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-110 duration-500 ${colorClass}`}>
        {React.isValidElement(icon) && React.cloneElement(icon as React.ReactElement<any>, { size: 64 })}
      </div>
      
      <div className="z-10">
        <p className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-1">{title}</p>
        <h3 className="text-3xl font-bold text-white">{value}</h3>
        {trend && (
          <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
             {trend}
          </p>
        )}
      </div>
      
      <div className={`p-3 rounded-lg bg-slate-900/50 ${colorClass} text-white z-10`}>
        {icon}
      </div>
    </div>
  );
};