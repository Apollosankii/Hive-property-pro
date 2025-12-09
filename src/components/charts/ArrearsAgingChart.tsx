import { useState } from 'react'
import { BarChart, LineChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { formatCurrency } from '@/lib/utils'
import { BarChart3, LineChart as LineChartIcon } from 'lucide-react'

interface ArrearsAgingChartProps {
  data: Array<{
    period: string
    count: number
    amount: number
  }>
}

export function ArrearsAgingChart({ data }: ArrearsAgingChartProps) {
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar')

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-white dark:bg-zinc-800 p-4 rounded-xl shadow-2xl border border-slate-200 dark:border-zinc-700 backdrop-blur-sm">
          <p className="text-sm font-bold text-slate-900 dark:text-zinc-50 mb-3 pb-2 border-b border-slate-200 dark:border-zinc-700">
            {data.period}
          </p>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-slate-600 dark:text-zinc-400">Count:</span>
              <span className="text-sm font-bold text-slate-900 dark:text-zinc-50">{data.count}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: payload[0].color }}
                />
                <span className="text-sm font-medium text-slate-600 dark:text-zinc-400">Amount:</span>
              </div>
              <span className="text-sm font-bold text-red-600 dark:text-red-400">
                {formatCurrency(payload[0].value)}
              </span>
            </div>
          </div>
        </div>
      )
    }
    return null
  }

  const renderChart = () => {
    const commonProps = {
      data,
      margin: { top: 10, right: 30, left: 20, bottom: 10 },
    }

    switch (chartType) {
      case 'bar':
        return (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-zinc-700" opacity={0.3} />
            <XAxis 
              dataKey="period" 
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
              dataKey="amount" 
              fill="#ef4444"
              radius={[8, 8, 0, 0]}
              name="Outstanding Amount"
            />
          </BarChart>
        )

      case 'line':
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-zinc-700" opacity={0.3} />
            <XAxis 
              dataKey="period" 
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
            <Line 
              type="monotone" 
              dataKey="amount" 
              stroke="#ef4444"
              strokeWidth={3}
              dot={{ fill: '#ef4444', r: 5, strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 7, strokeWidth: 2, stroke: '#fff' }}
              name="Outstanding Amount"
            />
          </LineChart>
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
          onClick={() => setChartType('bar')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            chartType === 'bar'
              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 shadow-sm'
              : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700'
          }`}
        >
          <BarChart3 size={16} />
          Bar
        </button>
        <button
          onClick={() => setChartType('line')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            chartType === 'line'
              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 shadow-sm'
              : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700'
          }`}
        >
          <LineChartIcon size={16} />
          Line
        </button>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={350}>
        {renderChart()}
      </ResponsiveContainer>
    </div>
  )
}
