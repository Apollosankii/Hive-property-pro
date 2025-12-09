import { useState } from 'react'
import { LineChart, BarChart, ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { formatCurrency } from '@/lib/utils'
import { BarChart3, LineChart as LineChartIcon, Layers } from 'lucide-react'

interface RevenueChartProps {
  data: Array<{
    month: string
    revenue: number
    expenses?: number
    profit?: number
  }>
}

export function RevenueChart({ data }: RevenueChartProps) {
  const [chartType, setChartType] = useState<'line' | 'bar' | 'composed'>('line')

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
      case 'line':
        return (
          <LineChart {...commonProps}>
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
            <Legend 
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="line"
            />
            <Line 
              type="monotone" 
              dataKey="revenue" 
              stroke={chartColors.revenue}
              strokeWidth={3}
              dot={{ fill: chartColors.revenue, r: 5, strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 7, strokeWidth: 2, stroke: '#fff' }}
              name="Revenue"
            />
            {data[0]?.expenses !== undefined && (
              <Line 
                type="monotone" 
                dataKey="expenses" 
                stroke={chartColors.expenses}
                strokeWidth={3}
                dot={{ fill: chartColors.expenses, r: 5, strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 7, strokeWidth: 2, stroke: '#fff' }}
                name="Expenses"
              />
            )}
            {data[0]?.profit !== undefined && (
              <Line 
                type="monotone" 
                dataKey="profit" 
                stroke={chartColors.profit}
                strokeWidth={3}
                dot={{ fill: chartColors.profit, r: 5, strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 7, strokeWidth: 2, stroke: '#fff' }}
                name="Profit"
              />
            )}
          </LineChart>
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
            {data[0]?.expenses !== undefined && (
              <Bar 
                dataKey="expenses" 
                fill={chartColors.expenses}
                radius={[8, 8, 0, 0]}
                name="Expenses"
              />
            )}
            {data[0]?.profit !== undefined && (
              <Bar 
                dataKey="profit" 
                fill={chartColors.profit}
                radius={[8, 8, 0, 0]}
                name="Profit"
              />
            )}
          </BarChart>
        )

      case 'composed':
        return (
          <ComposedChart {...commonProps}>
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
              fill={chartColors.revenue}
              radius={[8, 8, 0, 0]}
              name="Revenue"
              opacity={0.8}
            />
            {data[0]?.expenses !== undefined && (
              <Bar 
                yAxisId="left"
                dataKey="expenses" 
                fill={chartColors.expenses}
                radius={[8, 8, 0, 0]}
                name="Expenses"
                opacity={0.8}
              />
            )}
            {data[0]?.profit !== undefined && (
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
            )}
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
          onClick={() => setChartType('line')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            chartType === 'line'
              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 shadow-sm'
              : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700'
          }`}
        >
          <LineChartIcon size={16} />
          Line
        </button>
        <button
          onClick={() => setChartType('bar')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            chartType === 'bar'
              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 shadow-sm'
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
              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 shadow-sm'
              : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700'
          }`}
        >
          <Layers size={16} />
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
