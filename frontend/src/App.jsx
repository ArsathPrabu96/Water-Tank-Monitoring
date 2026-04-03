import { useState, useEffect, useRef } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Droplets, Activity, AlertTriangle, CheckCircle, Wifi, Gauge, TrendingUp, Clock, Droplet, Bell } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function App() {
  const [data, setData] = useState({ water_level: 0, distance_cm: 0, status: 'NORMAL' })
  const [history, setHistory] = useState([])
  const [alerts, setAlerts] = useState([])
  const [stats, setStats] = useState({ avg_level: 0, min_level: 0, max_level: 0, total_readings: 0 })
  const [connected, setConnected] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [animatedLevel, setAnimatedLevel] = useState(0)
  const wsRef = useRef(null)

  useEffect(() => {
    fetchLatestData()
    fetchHistory()
    fetchAlerts()
    fetchStats()
    connectWebSocket()
    
    const interval = setInterval(() => {
      fetchLatestData()
      fetchHistory()
      fetchStats()
    }, 10000)
    
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const target = data.water_level
    const step = (target - animatedLevel) / 20
    const timer = setTimeout(() => {
      if (Math.abs(target - animatedLevel) > 0.5) {
        setAnimatedLevel(prev => prev + step)
      } else {
        setAnimatedLevel(target)
      }
    }, 30)
    return () => clearTimeout(timer)
  }, [data.water_level, animatedLevel])

  const connectWebSocket = () => {
    const wsUrl = API_URL.replace('http', 'ws') + '/ws'
    wsRef.current = new WebSocket(wsUrl)
    
    wsRef.current.onopen = () => setConnected(true)
    
    wsRef.current.onmessage = (event) => {
      const newData = JSON.parse(event.data)
      setData({
        water_level: newData.water_level,
        distance_cm: newData.distance_cm,
        status: newData.status
      })
      setLastUpdated(new Date())
      fetchHistory()
    }
    
    wsRef.current.onclose = () => {
      setConnected(false)
      setTimeout(connectWebSocket, 3000)
    }
  }

  const fetchLatestData = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/data/latest`)
      if (res.ok) {
        const json = await res.json()
        setData({
          water_level: json.water_level,
          distance_cm: json.distance_cm,
          status: json.status
        })
        setLastUpdated(new Date(json.timestamp))
      }
    } catch (e) {
      console.error('Failed to fetch data:', e)
    }
  }

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/data/history?limit=50`)
      if (res.ok) {
        const json = await res.json()
        const formatted = json.reverse().map((item, index) => ({
          time: new Date(item.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          level: item.water_level,
          index
        }))
        setHistory(formatted)
      }
    } catch (e) {
      console.error('Failed to fetch history:', e)
    }
  }

  const fetchAlerts = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/alerts?limit=10`)
      if (res.ok) {
        const json = await res.json()
        setAlerts(json)
      }
    } catch (e) {
      console.error('Failed to fetch alerts:', e)
    }
  }

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/stats`)
      if (res.ok) {
        const json = await res.json()
        setStats({
          avg_level: json.avg_level,
          min_level: json.min_level,
          max_level: json.max_level,
          total_readings: json.total_readings
        })
      }
    } catch (e) {
      console.error('Failed to fetch stats:', e)
    }
  }

  const getStatusClass = (status) => {
    if (status === 'LOW') return 'low'
    if (status === 'FULL') return 'full'
    return 'normal'
  }

  const getStatusText = (status) => {
    if (status === 'LOW') return 'LOW WATER'
    if (status === 'FULL') return 'FULL TANK'
    return 'NORMAL'
  }

  const getStatusDescription = (status) => {
    if (status === 'LOW') return 'Water level is critically low. Refill required!'
    if (status === 'FULL') return 'Tank is full. Stop water supply!'
    return 'Water level is optimal'
  }

  const waterHeight = Math.min(100, Math.max(0, animatedLevel))

  const gaugePercent = (animatedLevel / 100) * 275
  const gaugeOffset = 565 - gaugePercent

  return (
    <div className="dashboard">
      <header className="header">
        <div className="header-content">
          <h1>Water Tank Monitor</h1>
          <div className="header-subtitle">Real-time IoT Dashboard</div>
        </div>
        <div className="status-badge">
          <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`}></span>
          <span>{connected ? 'Live' : 'Offline'}</span>
          <div className="pulse-ring"></div>
        </div>
      </header>

      <div className="grid">
        <div className="card tank-card">
          <div className="card-header">
            <span className="card-title">Water Level</span>
            <div className="card-icon">
              <Droplets size={22} />
            </div>
          </div>
          <div className="tank-container">
            <div className="tank-wrapper">
              <div className="tank">
                <div className="water-level-lines">
                  {[...Array(10)].map((_, i) => (
                    <div key={i} className="level-line" style={{ bottom: `${i * 10}%` }}></div>
                  ))}
                </div>
                <div className={`water ${getStatusClass(data.status)}`} style={{ height: `${waterHeight}%` }}>
                  <div className="wave-animation"></div>
                  <div className="bubbles">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="bubble" style={{ 
                        left: `${20 + i * 15}%`, 
                        animationDelay: `${i * 0.5}s`,
                        animationDuration: `${2 + i * 0.3}s`
                      }}></div>
                    ))}
                  </div>
                </div>
                <div className="tank-markers">
                  <span className="marker full">100%</span>
                  <span className="marker empty">0%</span>
                </div>
              </div>
              <div className="level-display">
                <div className={`level-value ${getStatusClass(data.status)}`}>
                  {animatedLevel.toFixed(0)}
                  <span className="percent-sign">%</span>
                </div>
                <div className="level-label">
                  <Droplet size={14} />
                  Water Level
                </div>
                <div className="distance-info">
                  <span className="distance-label">Sensor:</span>
                  <span className="distance-value">{data.distance_cm} cm</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card gauge-card">
          <div className="card-header">
            <span className="card-title">Level Gauge</span>
            <div className="card-icon">
              <Gauge size={22} />
            </div>
          </div>
          <div className="gauge-container">
            <div className="gauge">
              <svg className="gauge-circle" viewBox="0 0 200 200">
                <circle className="gauge-bg" cx="100" cy="100" r="90" />
                <circle 
                  className={`gauge-fill ${getStatusClass(data.status)}`} 
                  cx="100" cy="100" r="90"
                  style={{ strokeDashoffset: gaugeOffset }}
                />
              </svg>
              <div className="gauge-center">
                <div className={`gauge-value ${getStatusClass(data.status)}`}>
                  {animatedLevel.toFixed(0)}%
                </div>
                <div className="gauge-label">Current</div>
              </div>
            </div>
            <div className="gauge-status">
              <div className={`gauge-status-dot ${getStatusClass(data.status)}`}></div>
              <span>{getStatusText(data.status)}</span>
            </div>
          </div>
        </div>

        <div className="card status-card-main">
          <div className="card-header">
            <span className="card-title">System Status</span>
            <div className="card-icon">
              <Activity size={22} />
            </div>
          </div>
          <div className="status-card">
            <div className={`status-ring ${getStatusClass(data.status)}`}>
              <div className={`status-indicator ${getStatusClass(data.status)}`}>
                {data.status === 'NORMAL' ? (
                  <CheckCircle size={48} />
                ) : data.status === 'LOW' ? (
                  <AlertTriangle size={48} />
                ) : (
                  <CheckCircle size={48} />
                )}
              </div>
            </div>
            <div className={`status-text ${getStatusClass(data.status)}`}>
              {getStatusText(data.status)}
            </div>
            <div className="status-description">
              {getStatusDescription(data.status)}
            </div>
            <div className="status-details">
              <div className="detail-item">
                <TrendingUp size={16} />
                <span>Level: {data.water_level.toFixed(1)}%</span>
              </div>
              <div className="detail-item">
                <Gauge size={16} />
                <span>Distance: {data.distance_cm}cm</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid stats-grid-main">
        <div className="card stats-card">
          <div className="card-header">
            <span className="card-title">Statistics</span>
            <div className="card-icon">
              <Activity size={22} />
            </div>
          </div>
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-icon">
                <TrendingUp size={20} />
              </div>
              <div className="stat-value">{stats.avg_level.toFixed(1)}%</div>
              <div className="stat-label">Average</div>
            </div>
            <div className="stat-item">
              <div className="stat-icon down">
                <TrendingUp size={20} style={{ transform: 'rotate(180deg)' }} />
              </div>
              <div className="stat-value">{stats.min_level || 0}%</div>
              <div className="stat-label">Minimum</div>
            </div>
            <div className="stat-item">
              <div className="stat-icon up">
                <TrendingUp size={20} />
              </div>
              <div className="stat-value">{stats.max_level || 0}%</div>
              <div className="stat-label">Maximum</div>
            </div>
            <div className="stat-item full-width">
              <div className="stat-icon">
                <Gauge size={20} />
              </div>
              <div className="stat-value">{stats.total_readings}</div>
              <div className="stat-label">Total Readings</div>
            </div>
          </div>
        </div>

        <div className="card chart-card">
          <div className="card-header">
            <span className="card-title">History Graph</span>
            <div className="card-icon">
              <TrendingUp size={22} />
            </div>
          </div>
          <div className="chart-container">
            {history.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history}>
                  <defs>
                    <linearGradient id="colorLevel" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorLevelLow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="time" 
                    stroke="rgba(255,255,255,0.2)" 
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    domain={[0, 100]} 
                    stroke="rgba(255,255,255,0.2)" 
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(10, 10, 15, 0.95)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      fontSize: '12px',
                      backdropFilter: 'blur(10px)'
                    }}
                    formatter={(v) => [`${v.toFixed(1)}%`, 'Level']}
                  />
                  <Area
                    type="monotone"
                    dataKey="level"
                    stroke="#3b82f6"
                    strokeWidth={3}
                    fill="url(#colorLevel)"
                    animationDuration={1000}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="no-data">No historical data available</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid">
        <div className="card alerts-card">
          <div className="card-header">
            <span className="card-title">Recent Alerts</span>
            <div className="card-icon alert-icon-card">
              <Bell size={22} />
            </div>
          </div>
          <div className="alerts-list">
            {alerts.length === 0 ? (
              <div className="no-alerts">
                <CheckCircle size={32} />
                <span>No alerts - system is healthy</span>
              </div>
            ) : (
              alerts.slice(0, 8).map((alert, index) => (
                <div 
                  key={index} 
                  className="alert-item"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className={`alert-icon ${alert.alert_type.toLowerCase()}`}>
                    <AlertTriangle size={20} />
                  </div>
                  <div className="alert-content">
                    <div className="alert-message">{alert.message}</div>
                    <div className="alert-time">
                      <Clock size={12} />
                      {new Date(alert.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card device-card">
          <div className="card-header">
            <span className="card-title">Device Info</span>
            <div className="card-icon">
              <Wifi size={22} />
            </div>
          </div>
          <div className="device-info">
            <div className="info-item">
              <span className="info-label">
                <Wifi size={14} />
                Device ID
              </span>
              <span className="info-value">tank_001</span>
            </div>
            <div className="info-item">
              <span className="info-label">
                <Droplets size={14} />
                Current Level
              </span>
              <span className="info-value highlight">{data.water_level.toFixed(1)}%</span>
            </div>
            <div className="info-item">
              <span className="info-label">
                <Gauge size={14} />
                Distance
              </span>
              <span className="info-value">{data.distance_cm} cm</span>
            </div>
            <div className="info-item">
              <span className="info-label">
                <Activity size={14} />
                Status
              </span>
              <span className={`info-value status-${getStatusClass(data.status)}`}>
                {data.status}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="last-updated">
        <Clock size={14} />
        Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Never'}
      </div>
    </div>
  )
}

export default App