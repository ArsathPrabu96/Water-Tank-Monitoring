# Smart Water Level Monitoring System

Real-time IoT dashboard for monitoring water tank levels using ESP32, ultrasonic sensor, and a modern React dashboard.

## Architecture

```
┌─────────────────┐
│   ESP32 Device   │
│  (Firmware C++)  │
└────────┬────────┘
         │ HTTP/JSON
         ▼
┌─────────────────┐
│  FastAPI Backend │
│  (Python)       │
└────────┬────────┘
         │ WebSocket
         ▼
┌─────────────────┐
│ React Dashboard  │
│    (React.js)   │
└─────────────────┘
```

## Hardware

- **Microcontroller**: ESP32 (DevKit C)
- **Sensor**: HC-SR04 Ultrasonic
- **Display**: SSD1306 OLED (128x64 I2C)
- **Buzzer**: Passive buzzer

### Pin Connections

| Component | ESP32 Pin |
|-----------|-----------|
| HC-SR04 Trig | GPIO 5 |
| HC-SR04 Echo | GPIO 18 |
| OLED SDA | GPIO 21 |
| OLED SCL | GPIO 22 |
| Buzzer | GPIO 4 |

## Project Structure

```
WaterTankMonitor/
├── firmware/           # ESP32 Arduino code
│   └── water_tank_monitor.cpp
├── backend/           # FastAPI Python server
│   ├── main.py
│   └── requirements.txt
├── frontend/         # React Vite dashboard
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── index.css
│   │   └── vite.config.js
│   └── package.json
└── README.md
```

## Quick Start

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
python main.py
```

Server runs on http://localhost:8000

API docs: http://localhost:8000/docs

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Dashboard runs on http://localhost:3000

### 3. ESP32 Firmware

1. Open `firmware/water_tank_monitor.cpp` in Arduino IDE
2. Install libraries:
   - WiFi
   - HTTPClient
   - PubSubClient
   - Adafruit_GFX
   - Adafruit_SSD1306
   - NewPing
3. Configure WiFi credentials in firmware
4. Upload to ESP32

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/data` | Receive sensor data |
| GET | `/api/v1/data/latest` | Get latest reading |
| GET | `/api/v1/data/history` | Get reading history |
| GET | `/api/v1/alerts` | Get alert log |
| GET | `/api/v1/devices` | List registered devices |
| GET | `/api/v1/stats` | Get statistics |
| GET | `/ws` | WebSocket for live data |
| GET | `/health` | Health check |

## Configuration

### Firmware Settings

In `firmware/water_tank_monitor.cpp`:

```cpp
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* serverURL = "http://YOUR_SERVER:8000/api/v1/data";
const int lowThreshold = 20;      // Low water alert %
const int highThreshold = 90;     // Full water alert %
const int TANK_HEIGHT_CM = 100;  // Tank height in cm
```

### Backend Configuration

Default: SQLite database (`watertank.db`)

For PostgreSQL, modify `main.py` database connection.

### Frontend Configuration

Set `VITE_API_URL` in `.env`:
```
VITE_API_URL=http://localhost:8000
```

## Features

- Real-time water level monitoring
- Live WebSocket updates
- Historical data graph
- Alert system (LOW/FULL)
- Device status tracking
- Dark glassmorphism UI
- Mobile responsive

## Status Indication

| Status | Color | Condition |
|--------|-------|-----------|
| LOW | Red | < 20% water level |
| NORMAL | Blue | 20-90% water level |
| FULL | Green | > 90% water level |

## Deployment

### Local Development

1. Start backend: `cd backend && python main.py`
2. Start frontend: `cd frontend && npm run dev`
3. Upload firmware to ESP32

### Production

#### Backend (Railway/Render/PythonAnywhere)
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

#### Frontend (Vercel/Netlify)
```bash
cd frontend
npm run build
# Deploy dist folder
```

## Hardware Setup

```
┌──────────────┐
│   ESP32      │
│  ┌────────┐  │
│  │        │  │
│  └────────┘  │
│   │    │     │
│   │    │     │
┌──┴─┐ ┌┴─┐  │
│Trig │ │Ech│  │
└──┬──┘ └──┘  │
   │         │
┌──┴─────────┐ │
│ HC-SR04   │ │
└───────────┘ │
```

## License

MIT License

## Author

Created for IoT portfolio project