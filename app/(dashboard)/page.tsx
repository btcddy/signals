export default function DashboardPage() {
  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">PortfolioPulse</h1>
      <p className="text-gray-400 mb-8">
        Consolidated portfolio tracking with technical analysis signals.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h2 className="text-sm text-gray-400 uppercase tracking-wide">Total Holdings</h2>
          <p className="text-2xl font-bold mt-1">—</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h2 className="text-sm text-gray-400 uppercase tracking-wide">Portfolio Value</h2>
          <p className="text-2xl font-bold mt-1">—</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h2 className="text-sm text-gray-400 uppercase tracking-wide">Today&apos;s Signal</h2>
          <p className="text-2xl font-bold mt-1">—</p>
        </div>
      </div>

      <div className="mt-8 bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h2 className="text-lg font-semibold mb-4">Getting Started</h2>
        <ol className="space-y-3 text-gray-300">
          <li>1. Add your brokerage platforms</li>
          <li>2. Import trades via CSV or add them manually</li>
          <li>3. Run the signal engine to generate technical analysis</li>
          <li>4. Monitor your positions with Fib levels, RSI, EMA, and MACD</li>
        </ol>
      </div>
    </main>
  );
}
