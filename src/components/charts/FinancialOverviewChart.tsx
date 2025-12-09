import { useState } from 'react'
import { AreaChart, BarChart, ComposedChart, Area, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { formatCurrency } from '@/lib/utils'
import { BarChart3, LineChart as LineChartIcon, Layers } from 'lucide-react'

interface FinancialOverviewChartProps {
  data: Array<{
    month: string
    revenue: number
    expenses: number
    profit: number
  }>
}

export function FinancialOverviewChart({ data }: FinancialOverviewChartProps) {
  const [chartType, setChartType] = useState<'area' | 'bar' | 'composed'>('area')

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-zinc-800 p-4 rounded-xl shadow-2xl border border-slate-200 dark:border-zinc-700 backdrop-blur-sm">
          <p className="text-sm font-bold text-slate-900 dark:text-zinc-50 mb-3 pb-2 border-b border-slate-200 dark:border-zinc-700">
            {payload[0].payload.month}
          </p>
          <div className="space-y-2">
            {payload.map((entry: any, index: number) => (
              <div key={index} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-sm font-medium text-slate-600 dark:text-zinc-400">
                    {entry.name}:
                  </span>
                </div>
                <span className="text-sm font-bold" style={{ color: entry.color }}>
                  {formatCurrency(entry.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )
    }
    return null
  }

  const chartColors = {
    revenue: '#10b981',
    expenses: '#ef4444',
    profit: '#3b82f6',
  }

  const renderChart = () => {
    const commonProps = {
      data,
      margin: { top: 10, right: 30, left: 20, bottom: 10 },
    }

    switch (chartType) {
      case 'area':
        return (
          <AreaChart {...commonProps}>
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartColors.revenue} stopOpacity={0.9}/>
                <stop offset="95%" stopColor={chartColors.revenue} stopOpacity={0.1}/>
              </linearGradient>
              <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartColors.expenses} stopOpacity={0.9}/>
                <stop offset="95%" stopColor={chartColors.expenses} stopOpacity={0.1}/>
              </linearGradient>
              <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartColors.profit} stopOpacity={0.9}/>
                <stop offset="95%" stopColor={chartColors.profit} stopOpacity={0.1}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-zinc-700" opacity={0.3} />
            <XAxis 
              dataKey="month" 
              stroke="#64748b"
              tick={{ fill: '#64748b', fontSize: 12 }}
              tickLine={{ stroke: '#cbd5e1' }}
            />
            <YAxis 
              stroke="#64748b"
              tick={{ fill: '#64748b', fontSize: 12 }}
              tickLine={{ stroke: '#cbd5e1' }}
              tickFormatter={(value) => `KES ${(value / 1000).toFixed(0)}K`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ paddingTop: '20px' }} />
            <Area 
              type="monotone" 
              dataKey="revenue" 
              stroke={chartColors.revenue}
              strokeWidth={2}
              fillOpacity={0.7} 
              fill="url(#colorRevenue)"
              name="Revenue"
            />
            <Area 
              type="monotone" 
              dataKey="expenses" 
              stroke={chartColors.expenses}
              strokeWidth={2}
              fillOpacity={0.7} 
              fill="url(#colorExpenses)"
              name="Expenses"
            />
            <Area 
              type="monotone" 
              dataKey="profit" 
              stroke={chartColors.profit}
              strokeWidth={2}
              fillOpacity={0.7} 
              fill="url(#colorProfit)"
              name="Profit"
            />
          </AreaChart>
        )

      case 'bar':
        return (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-zinc-700" opacity={0.3} />
            <XAxis 
              dataKey="month" 
              stroke="#64748b"
              tick={{ fill: '#64748b', fontSize: 12 }}
              tickLine={{ stroke: '#cbd5e1' }}
            />
            <YAxis 
              stroke="#64748b"
              tick={{ fill: '#64748b', fontSize: 12 }}
              tickLine={{ stroke: '#cbd5e1' }}
              tickFormatter={(value) => `KES ${(value / 1000).toFixed(0)}K`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ paddingTop: '20px' }} />
            <Bar 
              dataKey="revenue" 
              fill={chartColors.revenue}
              radius={[8, 8, 0, 0]}
              name="Revenue"
            />
            <Bar 
              dataKey="expenses" 
              fill={chartColors.expenses}
              radius={[8, 8, 0, 0]}
              name="Expenses"
            />
            <Bar 
              dataKey="profit" 
              fill={chartColors.profit}
              radius={[8, 8, 0, 0]}
              name="Profit"
            />
          </BarChart>
        )

      case 'composed':
        return (
          <ComposedChart {...commonProps}>
            <defs>
              <linearGradient id="composedRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartColors.revenue} stopOpacity={0.9}/>
                <stop offset="95%" stopColor={chartColors.revenue} stopOpacity={0.1}/>
              </linearGradient>
              <linearGradient id="composedExpenses" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartColors.expenses} stopOpacity={0.9}/>
                <stop offset="95%" stopColor={chartColors.expenses} stopOpacity={0.1}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-zinc-700" opacity={0.3} />
            <XAxis 
              dataKey="month" 
              stroke="#64748b"
              tick={{ fill: '#64748b', fontSize: 12 }}
              tickLine={{ stroke: '#cbd5e1' }}
            />
            <YAxis 
              yAxisId="left"
              stroke="#64748b"
              tick={{ fill: '#64748b', fontSize: 12 }}
              tickLine={{ stroke: '#cbd5e1' }}
              tickFormatter={(value) => `KES ${(value / 1000).toFixed(0)}K`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ paddingTop: '20px' }} />
            <Bar 
              yAxisId="left"
              dataKey="revenue" 
              fill="url(#composedRevenue)"
              radius={[8, 8, 0, 0]}
              name="Revenue"
              opacity={0.8}
            />
            <Bar 
              yAxisId="left"
              dataKey="expenses" 
              fill="url(#composedExpenses)"
              radius={[8, 8, 0, 0]}
              name="Expenses"
              opacity={0.8}
            />
            <Line 
              yAxisId="left"
              type="monotone" 
              dataKey="profit" 
              stroke={chartColors.profit}
              strokeWidth={3}
              dot={{ fill: chartColors.profit, r: 5, strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 7, strokeWidth: 2, stroke: '#fff' }}
              name="Profit"
            />
          </ComposedChart>
        )

      default:
        return null
    }
  }

  return (
    <div className="w-full">
      {/* Chart Type Toggle */}
      <div className="flex items-center justify-end gap-2 mb-4">
        <button
          onClick={() => setChartType('area')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            chartType === 'area'
              ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 shadow-sm'
              : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700'
          }`}
        >
          <Layers size={16} />
          Area
        </button>
        <button
          onClick={() => setChartType('bar')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            chartType === 'bar'
              ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 shadow-sm'
              : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700'
          }`}
        >
          <BarChart3 size={16} />
          Bar
        </button>
        <button
          onClick={() => setChartType('composed')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            chartType === 'composed'
              ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 shadow-sm'
              : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700'
          }`}
        >
          <LineChartIcon size={16} />
          Comprehensive
        </button>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={350}>
        {renderChart()}
      </ResponsiveContainer>
    </div>
  )
}
